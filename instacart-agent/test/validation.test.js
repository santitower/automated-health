import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ITEMS_PER_RUN,
  normalizeItems,
  normalizeStoreHref,
  parseAllowedOrigins,
  RequestError,
} from "../src/validation.js";

test("normalizes approved Instacart storefront paths", () => {
  assert.equal(normalizeStoreHref("/store/aldi/storefront"), "/store/aldi/storefront");
  assert.equal(
    normalizeStoreHref("https://www.instacart.com/store/costco/storefront?source=shop"),
    "/store/costco/storefront?source=shop",
  );
});

test("rejects non-Instacart and non-store URLs", () => {
  assert.throws(() => normalizeStoreHref("https://example.com/store/aldi/storefront"), RequestError);
  assert.throws(() => normalizeStoreHref("https://www.instacart.com/help"), RequestError);
});

test("normalizes grocery queries and package quantities", () => {
  assert.deepEqual(normalizeItems([
    { query: "  Greek   yogurt ", quantity: 2 },
    { query: "eggs" },
  ]), [
    { query: "Greek yogurt", quantity: 2 },
    { query: "eggs", quantity: 1 },
  ]);
});

test("rejects unsafe cart requests", () => {
  assert.throws(() => normalizeItems([]), RequestError);
  assert.throws(() => normalizeItems([{ query: "milk", quantity: 0 }]), RequestError);
  assert.throws(() => normalizeItems(Array.from({ length: MAX_ITEMS_PER_RUN + 1 }, () => ({ query: "milk" }))), RequestError);
});

test("parses an exact origin allowlist", () => {
  assert.deepEqual(
    parseAllowedOrigins("http://localhost:3000, https://automated-health.vercel.app "),
    ["http://localhost:3000", "https://automated-health.vercel.app"],
  );
});
