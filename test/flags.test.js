// Numeric flags must reject bad input before any network call, instead of
// silently replacing it with a default. Regression tests for the parsing bug
// where `--min-usd 0` became 1000, `--limit -2` reached `trades.slice(0, -2)`,
// and `--min-usd 5k` was accepted without a warning.
//
// Each case spawns the CLI so the real argument path is exercised. Nothing here
// touches the network: validation runs first, and the valid cases are only
// checked for "did not fail on validation", using a bogus RPC host so the run
// stops before any real request is made.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/whales.js", import.meta.url));
const MINT = "So11111111111111111111111111111111111111112";

/** Run the CLI with args, returning { status, stdout, stderr }. */
function run(args, env = {}, timeout = 20000) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    // A bogus RPC URL keeps a valid run from ever reaching a real endpoint.
    env: { ...process.env, SOLANA_RPC_URL: "http://127.0.0.1:0", SOLANA_RPC_GAP_MS: "1", ...env },
    timeout,
  });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

test("--limit rejects zero, negative and non-numeric values", () => {
  for (const value of ["0", "-2", "abc"]) {
    const { status, stderr } = run([MINT, "--limit", value]);
    assert.equal(status, 1, `--limit ${value} should exit 1`);
    assert.match(stderr, /--limit must be a whole number above 0/, `--limit ${value}`);
  }
});

test("--wallets rejects zero and negative values", () => {
  for (const value of ["0", "-1"]) {
    const { status, stderr } = run([MINT, "--wallets", value]);
    assert.equal(status, 1, `--wallets ${value} should exit 1`);
    assert.match(stderr, /--wallets must be a whole number above 0/, `--wallets ${value}`);
  }
});

test("--min-usd rejects negative and non-numeric values", () => {
  for (const value of ["-5", "abc", "5k"]) {
    const { status, stderr } = run([MINT, "--min-usd", value]);
    assert.equal(status, 1, `--min-usd ${value} should exit 1`);
    assert.match(stderr, /--min-usd must be a number of 0 or more/, `--min-usd ${value}`);
  }
});

test("--min-usd 0 is accepted and does not fall back to the default", () => {
  // 0 must pass validation (it means "everything the API returns"). The run is
  // pointed at a mint with no pools on a bogus RPC host, and stopped by the
  // spawn timeout: what matters is that it got past validation and did not
  // print the default 1000 floor.
  const { stdout, stderr } = run([MINT, "--min-usd", "0", "--limit", "1"], {}, 3000);
  assert.doesNotMatch(stderr, /must be a number of 0 or more/);
  assert.doesNotMatch(stdout, /No trades of \$1,000/);
});