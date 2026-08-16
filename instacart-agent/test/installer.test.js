import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const VERSION = "0.3.0";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("platform bootstraps point to the same versioned release", async () => {
  const [batch, powershell, linux] = await Promise.all([
    source("../Install-NutriPlan-Instacart-Agent.cmd"),
    source("../Install-NutriPlanInstacartAgent.ps1"),
    source("../install-linux.sh"),
  ]);

  assert.match(batch, new RegExp(`instacart-agent-v${VERSION}`));
  assert.match(powershell, new RegExp(`agentVersion = "${VERSION.replaceAll(".", "\\.")}"`));
  assert.match(linux, new RegExp(`agent_version="${VERSION.replaceAll(".", "\\.")}"`));
});

test("installers bootstrap private Node and Playwright Chromium", async () => {
  const files = await Promise.all([
    source("../Install NutriPlan Instacart Agent.command"),
    source("../Install-NutriPlanInstacartAgent.ps1"),
    source("../install-linux.sh"),
    source("../installer/macos/scripts/postinstall"),
  ]);

  for (const file of files) {
    assert.match(file, /nodejs\.org\/dist/);
    assert.match(file, /PLAYWRIGHT_BROWSERS_PATH/);
    assert.match(file, /playwright[\\/]cli\.js/);
    assert.doesNotMatch(file, /Google Chrome is required/);
  }
});

test("macOS and Linux installer scripts are executable", async () => {
  const paths = [
    "../Install NutriPlan Instacart Agent.command",
    "../install-linux.sh",
    "../installer/macos/build-package.sh",
    "../installer/macos/scripts/postinstall",
  ];
  for (const path of paths) {
    const file = await stat(new URL(path, import.meta.url));
    assert.notEqual(file.mode & 0o111, 0, `${path} should be executable`);
  }
});
