import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, readlink, rm, symlink } from "node:fs/promises";
import { hostname } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearStaleProfileLock } from "../src/profile-lock.js";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("private viewer bootstraps secrets from the URL fragment into a strict session cookie", async () => {
  const bootstrap = await source("../sandbox/nutriplan.html");

  assert.match(bootstrap, /location\.hash/);
  assert.match(bootstrap, /__Host-nutriplan-view/);
  assert.match(bootstrap, /SameSite=Strict/);
  assert.match(bootstrap, /history\.replaceState/);
  assert.doesNotMatch(bootstrap, /location\.search/);
});

test("websocket authorization compares its rotating cookie in constant time", async () => {
  const plugin = await source("../sandbox/cookie_auth.py");

  assert.match(plugin, /compare_digest/);
  assert.match(plugin, /__Host-nutriplan-view/);
  assert.match(plugin, /AuthenticationError/);
});

test("remote Chromium disables password and payment credential storage", async () => {
  const browser = await source("../src/instacart.js");

  assert.match(browser, /credentials_enable_service = false/);
  assert.match(browser, /password_manager_enabled: false/);
  assert.match(browser, /credit_card_enabled: false/);
  assert.match(browser, /acceptDownloads: false/);
  assert.doesNotMatch(browser, /\$\{error\.message\}/);
});

test("the loopback agent can close Chromium before a sandbox snapshot", async () => {
  const server = await source("../src/server.js");

  assert.match(server, /req\.url === "\/close"/);
  assert.match(server, /runExclusive\("closing Instacart", closeBrowser\)/);
});

test("restored sandboxes remove only stale Chromium singleton links", async (t) => {
  const profileDir = await mkdtemp(join(tmpdir(), "nutriplan-profile-lock-"));
  t.after(() => rm(profileDir, { recursive: true, force: true }));
  await Promise.all([
    symlink(`foreign-nutriplan-sandbox-${process.pid}`, join(profileDir, "SingletonLock")),
    symlink("cookie", join(profileDir, "SingletonCookie")),
    symlink("socket", join(profileDir, "SingletonSocket")),
  ]);

  assert.equal(await clearStaleProfileLock(profileDir), true);
  await assert.rejects(lstat(join(profileDir, "SingletonLock")), { code: "ENOENT" });
});

test("a live local Chromium singleton lock is never removed", async (t) => {
  const profileDir = await mkdtemp(join(tmpdir(), "nutriplan-profile-live-lock-"));
  t.after(() => rm(profileDir, { recursive: true, force: true }));
  const lockPath = join(profileDir, "SingletonLock");
  const lockTarget = `${hostname()}-${process.pid}`;
  await symlink(lockTarget, lockPath);

  assert.equal(await clearStaleProfileLock(profileDir), false);
  assert.equal((await lstat(lockPath)).isSymbolicLink(), true);
  assert.equal(await readlink(lockPath), lockTarget);
});
