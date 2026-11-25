// `--version` prints the installed version and exits 0, before any network
// call, so bug reports can say which version they run.
//
// Each case spawns the CLI so the real argument path is exercised. Nothing
// here touches the network: the flag returns before any fetch.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const CLI = fileURLToPath(new URL("../bin/whales.js", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

/** Run the CLI with args, returning { status, stdout, stderr }. */
function run(args, timeout = 20000) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", timeout });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

test("--version prints the version from package.json and exits 0", () => {
  const { status, stdout } = run(["--version"]);
  assert.equal(status, 0, "--version should exit 0");
  assert.equal(stdout.trim(), `solana-whale-tracker ${pkg.version}`);
});

test("--version works with a mint and prints nothing else", () => {
  const { status, stdout } = run(["--version", "So11111111111111111111111111111111111111112"]);
  assert.equal(status, 0, "--version with a mint should exit 0");
  assert.equal(stdout.trim(), `solana-whale-tracker ${pkg.version}`);
});
