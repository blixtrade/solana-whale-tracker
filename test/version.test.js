// `whales --version` must print the package version and exit 0, before any
// network call. Previously the flag fell through to the help text and exited 1,
// which matters because people run the tool through `npx github:...` and cannot
// tell which commit they got.
//
// The test spawns the real CLI; it is offline because --version returns before
// any fetch.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const CLI = fileURLToPath(new URL("../bin/whales.js", import.meta.url));
const PKG = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));

test("--version prints the package version and exits 0", () => {
  const result = spawnSync(process.execPath, [CLI, "--version"], {
    encoding: "utf8",
    timeout: 20000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), `solana-whale-tracker ${PKG.version}`);
});

test("--version wins over a mint and does not touch the network", () => {
  // A bogus RPC host proves nothing was fetched: --version returns first.
  const result = spawnSync(process.execPath, [CLI, "So11111111111111111111111111111111111111112", "--version"], {
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, SOLANA_RPC_URL: "http://127.0.0.1:0" },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), `solana-whale-tracker ${PKG.version}`);
});

test("--help still prints the help text and exits 0", () => {
  const result = spawnSync(process.execPath, [CLI, "--help"], {
    encoding: "utf8",
    timeout: 20000,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--version/);
});