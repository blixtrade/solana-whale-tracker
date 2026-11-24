// With `--watch --json` the initial batch of trades must be printed as JSON
// lines, oldest first, before the loop starts. Previously the batch was fetched
// and discarded: line 52 only printed JSON when `!watch`, and the text block was
// skipped because `args.json` was set, so a script reading the stream saw
// nothing for the first poll interval.
//
// This runs the real CLI with a fetch stub, reads the first lines of stdout,
// checks each parses as a trade, then kills the child.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLI = fileURLToPath(new URL("../bin/whales.js", import.meta.url));
// --import needs a file:// URL on Windows, where an absolute "E:\..." path is
// rejected by the ESM loader.
const MOCK = pathToFileURL(fileURLToPath(new URL("./fixtures/mock-fetch.mjs", import.meta.url))).href;
const MINT = "So11111111111111111111111111111111111111112";

/** Run the CLI and collect stdout lines until `wanted` lines arrive or it ends. */
function collectLines(args, wanted, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", MOCK, CLI, ...args],
      { env: { ...process.env, NO_COLOR: "1" } }
    );

    const lines = [];
    let buffer = "";
    let settled = false;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`timed out after ${timeoutMs}ms with ${lines.length} lines: ${JSON.stringify(lines)}`)));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim() === "") continue;
        lines.push(line);
        if (lines.length >= wanted) {
          finish(() => resolve(lines));
          return;
        }
      }
    });

    child.on("error", (err) => finish(() => reject(err)));
  });
}

test("--watch --json prints the initial trades as JSON lines, oldest first", async () => {
  const lines = await collectLines([MINT, "--watch", "--json"], 2, 8000);

  const trades = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      assert.fail(`a line was not JSON: ${JSON.stringify(line)}`);
    }
  });

  // Each line is a trade with the fields a stream consumer reads.
  for (const trade of trades) {
    assert.equal(typeof trade.id, "string");
    assert.equal(typeof trade.usd, "number");
    assert.ok(trade.side === "buy" || trade.side === "sell");
  }

  // The batch is printed oldest first, so the first line predates the second.
  assert.ok(trades.length >= 2, "expected at least the two fixture trades");
  assert.ok(
    trades[0].time <= trades[1].time,
    "the initial batch must be oldest first"
  );
});
