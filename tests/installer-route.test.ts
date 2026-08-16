import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/downloads/instacart-agent/route.ts";

const route = "https://automated-health.vercel.app/downloads/instacart-agent";

function installerFor(userAgent: string) {
  return GET(new Request(route, { headers: { "user-agent": userAgent } }));
}

test("installer route selects native desktop downloads", () => {
  assert.match(installerFor("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)").headers.get("location") ?? "", /\.pkg$/);
  assert.match(installerFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64)").headers.get("location") ?? "", /\.cmd$/);
  assert.match(installerFor("Mozilla/5.0 (X11; Linux x86_64)").headers.get("location") ?? "", /install-linux\.sh$/);
});

test("installer route sends mobile and unknown clients to the release page", () => {
  assert.match(installerFor("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile").headers.get("location") ?? "", /\/releases\/tag\//);
  assert.match(installerFor("curl/8.7.1").headers.get("location") ?? "", /\/releases\/tag\//);
});
