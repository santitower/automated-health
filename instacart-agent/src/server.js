#!/usr/bin/env node
import { createServer } from "node:http";
import {
  browserIsRunning,
  closeBrowser,
  goHome,
  launchBrowser,
  listStores,
  openCart,
  openStore,
  searchAndAdd,
} from "./instacart.js";
import {
  normalizeItems,
  normalizeStoreHref,
  parseAllowedOrigins,
  RequestError,
} from "./validation.js";

const HOST = "127.0.0.1";
const PORT = process.env.PORT ? Number(process.env.PORT) : 4545;
const VERSION = "0.3.0";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://automated-health.vercel.app",
].join(",");
const ALLOWED_ORIGINS = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS,
);
const BODY_LIMIT = 256 * 1024;

let activeOperation = null;

function originAllowed(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-NutriPlan-Agent-Version", VERSION);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new RequestError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestError("Request body must be valid JSON.");
  }
}

async function runExclusive(name, operation) {
  if (activeOperation) {
    throw new RequestError(`The agent is already ${activeOperation}. Wait for that run to finish.`, 409);
  }
  activeOperation = name;
  try {
    return await operation();
  } finally {
    activeOperation = null;
  }
}

const server = createServer(async (req, res) => {
  applyCors(req, res);
  if (!originAllowed(req)) {
    return sendJson(res, 403, { error: "This website is not allowed to control the NutriPlan agent." });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, {
        ok: true,
        version: VERSION,
        browserRunning: browserIsRunning(),
        activeOperation,
      });
    }

    if (req.method === "GET" && req.url === "/stores") {
      const stores = await runExclusive("finding stores", async () => {
        const { page } = await launchBrowser();
        await goHome(page);
        return listStores(page);
      });
      return sendJson(res, 200, { stores });
    }

    if (req.method === "POST" && req.url === "/add") {
      const body = await readJsonBody(req);
      const storeHref = normalizeStoreHref(body.storeHref);
      const items = normalizeItems(body.items);
      const result = await runExclusive("building a cart", async () => {
        const { page } = await launchBrowser();
        await goHome(page);
        const stores = await listStores(page);
        const store = stores.find((candidate) => normalizeStoreHref(candidate.href) === storeHref);
        if (!store) throw new RequestError("That store is not available for the current Instacart address.");

        await openStore(page, store.href);
        const results = [];
        for (const item of items) {
          try {
            results.push(await searchAndAdd(page, item));
          } catch (error) {
            results.push({ query: item.query, added: false, reason: error.message });
          }
        }
        await openCart(page);
        return { store, results };
      });

      return sendJson(res, 200, {
        ...result,
        summary: {
          requested: result.results.length,
          added: result.results.filter((item) => item.added).length,
          skipped: result.results.filter((item) => !item.added).length,
        },
      });
    }

    return sendJson(res, 404, { error: "Not found. Try GET /health, GET /stores, or POST /add." });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    return sendJson(res, status, { error: error.message || "The Instacart agent failed." });
  }
});

server.requestTimeout = 10 * 60 * 1000;
server.listen(PORT, HOST, () => {
  console.log(`NutriPlan Instacart agent ${VERSION} listening on http://${HOST}:${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log("The private browser opens on the first store request and remains available for cart review.");
});

async function shutdown() {
  await closeBrowser();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
