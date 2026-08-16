import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";

const REPOSITORY_URL = "https://github.com/santitower/automated-health.git";
const LIVE_VIEW_PORT = 6080;
const SESSION_TIMEOUT = 20 * 60 * 1_000;
const COMMAND_TIMEOUT = 10 * 60 * 1_000;
const SANDBOX_VERSION = "v04";
const VNC_PASSWORD_PATH = "/vercel/sandbox/.nutriplan-vnc-password";

const CHROMIUM_SYSTEM_DEPENDENCIES = [
  "nss",
  "nspr",
  "libxkbcommon",
  "atk",
  "at-spi2-atk",
  "at-spi2-core",
  "libXcomposite",
  "libXdamage",
  "libXrandr",
  "libXfixes",
  "libXcursor",
  "libXi",
  "libXtst",
  "libXScrnSaver",
  "libXext",
  "mesa-libgbm",
  "libdrm",
  "mesa-libGL",
  "mesa-libEGL",
  "cups-libs",
  "alsa-lib",
  "pango",
  "cairo",
  "gtk3",
  "dbus-libs",
  "tigervnc-server",
  "python3-pip",
];

export type InstacartStore = { href: string; name: string };
export type InstacartResult = {
  query: string;
  added: boolean;
  matchedName?: string;
  reason?: string;
  quantity?: number;
};
export type InstacartCartSummary = { requested: number; added: number; skipped: number };

type AgentResponse = {
  status: number;
  body: string;
};

function sandboxName(userId: string) {
  const userHash = createHash("sha256").update(userId).digest("hex").slice(0, 22);
  return `np_${SANDBOX_VERSION}_${userHash}`;
}

async function runChecked(
  sandbox: Sandbox,
  command: string,
  args: string[],
  timeoutMs = COMMAND_TIMEOUT,
) {
  const result = await sandbox.runCommand({ cmd: command, args, timeoutMs });
  if (result.exitCode === 0) return result;

  const stderr = (await result.stderr()).trim();
  const stdout = (await result.stdout()).trim();
  throw new Error(stderr || stdout || `${command} failed with exit code ${result.exitCode}.`);
}

async function setupSandbox(sandbox: Sandbox) {
  await runChecked(sandbox, "sudo", [
    "dnf",
    "install",
    "-y",
    "--skip-broken",
    ...CHROMIUM_SYSTEM_DEPENDENCIES,
  ]);
  await runChecked(sandbox, "python3", [
    "-m",
    "pip",
    "install",
    "--user",
    "websockify==0.13.0",
  ]);
  await runChecked(sandbox, "git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    "v1.7.0",
    "https://github.com/novnc/noVNC.git",
    ".novnc",
  ]);
  await runChecked(sandbox, "npm", ["--prefix", "instacart-agent", "ci"]);
  await runChecked(sandbox, "node", [
    "instacart-agent/node_modules/playwright/cli.js",
    "install",
    "chromium",
  ]);

  const password = randomBytes(6).toString("base64url").slice(0, 8);
  await sandbox.writeFiles([
    { path: VNC_PASSWORD_PATH, content: `${password}\n`, mode: 0o600 },
  ]);
  await runChecked(sandbox, "sh", [
    "-c",
    [
      "mkdir -p /vercel/sandbox/.vnc",
      `vncpasswd -f < ${VNC_PASSWORD_PATH} > /vercel/sandbox/.vnc/passwd`,
      "chmod 600 /vercel/sandbox/.vnc/passwd",
    ].join(" && "),
  ]);
}

async function processIsRunning(sandbox: Sandbox, pattern: string) {
  const result = await sandbox.runCommand("pgrep", ["-f", pattern]);
  return result.exitCode === 0;
}

async function startDetached(
  sandbox: Sandbox,
  command: string,
  logFile: string,
  cwd = "/vercel/sandbox",
) {
  await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `exec ${command} >> ${logFile} 2>&1`],
    cwd,
    detached: true,
    timeoutMs: SESSION_TIMEOUT,
  });
}

async function ensureServices(sandbox: Sandbox) {
  if (!(await processIsRunning(sandbox, "[X]vnc :99"))) {
    await startDetached(
      sandbox,
      "Xvnc :99 -geometry 1280x800 -depth 24 -SecurityTypes VncAuth -PasswordFile /vercel/sandbox/.vnc/passwd -localhost yes -rfbport 5999 -ac",
      "/tmp/nutriplan-xvnc.log",
    );
  }

  if (!(await processIsRunning(sandbox, "[w]ebsockify.*6080"))) {
    await startDetached(
      sandbox,
      "python3 -m websockify --web /vercel/sandbox/.novnc 6080 localhost:5999",
      "/tmp/nutriplan-novnc.log",
    );
  }

  const health = await sandbox.runCommand("curl", [
    "-fsS",
    "http://127.0.0.1:4545/health",
  ]);
  if (health.exitCode !== 0) {
    await startDetached(
      sandbox,
      "env DISPLAY=:99 INSTACART_PROFILE_DIR=/vercel/sandbox/instacart-profile node src/server.js",
      "/tmp/nutriplan-instacart-agent.log",
      "/vercel/sandbox/instacart-agent",
    );
  }

  await runChecked(sandbox, "sh", [
    "-c",
    "for attempt in $(seq 1 30); do curl -fsS http://127.0.0.1:4545/health >/dev/null && curl -fsS http://127.0.0.1:6080/vnc.html >/dev/null && exit 0; sleep 1; done; exit 1",
  ], 35_000);
}

async function getUserSandbox(userId: string) {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA || "master";
  const sandbox = await Sandbox.getOrCreate({
    name: sandboxName(userId),
    source: { type: "git", url: REPOSITORY_URL, depth: 1, revision },
    runtime: "node22",
    ports: [LIVE_VIEW_PORT],
    timeout: SESSION_TIMEOUT,
    resources: { vcpus: 2 },
    persistent: true,
    keepLastSnapshots: { count: 1, expiration: 0, deleteEvicted: true },
    tags: { feature: "instacart", version: SANDBOX_VERSION },
    onCreate: setupSandbox,
  });
  await ensureServices(sandbox);
  return sandbox;
}

async function callAgent<T>(
  sandbox: Sandbox,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  timeoutMs = COMMAND_TIMEOUT,
): Promise<T> {
  const requestScript = [
    "const [path, method, rawBody] = process.argv.slice(1)",
    "const response = await fetch(`http://127.0.0.1:4545${path}`, {",
    "  method,",
    '  headers: rawBody ? { "Content-Type": "application/json" } : undefined,',
    "  body: rawBody || undefined,",
    "})",
    "const responseBody = await response.text()",
    "process.stdout.write(JSON.stringify({ status: response.status, body: responseBody }))",
  ].join("\n");
  const args = ["--input-type=module", "-e", requestScript, path, method];
  if (body !== undefined) args.push(JSON.stringify(body));

  const result = await runChecked(sandbox, "node", args, timeoutMs);
  const envelope = JSON.parse((await result.stdout()).trim()) as AgentResponse;
  const response = JSON.parse(envelope.body || "{}") as T & { error?: string };
  if (envelope.status >= 400) {
    throw new Error(response.error || `The Instacart browser responded ${envelope.status}.`);
  }
  return response;
}

export async function openInstacartSession(userId: string) {
  const sandbox = await getUserSandbox(userId);
  await callAgent<{ ok: true }>(sandbox, "/open", "POST", undefined, 90_000);

  const passwordBuffer = await sandbox.readFileToBuffer({ path: VNC_PASSWORD_PATH });
  if (!passwordBuffer) throw new Error("The private browser password is unavailable.");

  const liveUrl = new URL("/vnc.html", sandbox.domain(LIVE_VIEW_PORT));
  liveUrl.searchParams.set("autoconnect", "true");
  liveUrl.searchParams.set("resize", "remote");
  liveUrl.searchParams.set("path", "websockify");
  liveUrl.searchParams.set("password", passwordBuffer.toString("utf8").trim());
  return { liveUrl: liveUrl.toString() };
}

export async function findInstacartStores(userId: string) {
  const sandbox = await getUserSandbox(userId);
  return callAgent<{ stores: InstacartStore[] }>(sandbox, "/stores", "GET", undefined, 2 * 60 * 1_000);
}

export async function addInstacartItems(
  userId: string,
  storeHref: string,
  items: { query: string; quantity: number }[],
) {
  const sandbox = await getUserSandbox(userId);
  return callAgent<{
    results: InstacartResult[];
    summary: InstacartCartSummary;
  }>(sandbox, "/add", "POST", { storeHref, items });
}

export async function pauseInstacartSession(userId: string) {
  try {
    const sandbox = await Sandbox.get({ name: sandboxName(userId), resume: false });
    await sandbox.stop();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("not found")) throw error;
  }
}

export async function deleteInstacartSession(userId: string) {
  try {
    const sandbox = await Sandbox.get({ name: sandboxName(userId), resume: false });
    await sandbox.delete();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("not found")) throw error;
  }
}
