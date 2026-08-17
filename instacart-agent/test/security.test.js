import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
});
