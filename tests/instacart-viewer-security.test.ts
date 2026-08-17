import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrivateViewerUrl,
  INSTACART_ALLOWED_DOMAINS,
} from "../lib/instacart-viewer-security.ts";

test("viewer secrets are fragment-only and never sent in the HTTP request URL", () => {
  const liveUrl = new URL(buildPrivateViewerUrl(
    "https://sb-private.vercel.run",
    "viewer-secret",
    "vnc-pass",
  ));

  assert.equal(liveUrl.pathname, "/nutriplan.html");
  assert.equal(liveUrl.search, "");
  assert.equal(liveUrl.hash, "#token=viewer-secret&password=vnc-pass");
});

test("sandbox egress excludes advertising and social-login domains", () => {
  assert.ok(INSTACART_ALLOWED_DOMAINS.includes("*.instacart.com"));
  assert.ok(INSTACART_ALLOWED_DOMAINS.includes("d2guulkeunn7d8.cloudfront.net"));
  assert.ok(!INSTACART_ALLOWED_DOMAINS.some((domain) => (
    domain.includes("doubleclick")
    || domain.includes("facebook")
    || domain.includes("tiktok")
    || domain.includes("accounts.google")
  )));
});
