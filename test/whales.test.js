import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrade, summarize } from "../lib/whales.js";

const raw = (o) => ({ id: o.id || "t1", attributes: { block_timestamp: "2026-11-18T21:39:27Z", tx_hash: "sig", tx_from_address: "W1", kind: "sell", from_token_address: "MEME", to_token_address: "SOL", from_token_amount: "89539.5", to_token_amount: "5.8", price_from_in_usd: "0.0143", price_to_in_usd: "219.6", volume_in_usd: "1288.79", ...o } });

test("a trade is read from the token's side", () => {
  const sell = normalizeTrade(raw({}), "MEME");
  assert.equal(sell.side, "sell");
  assert.equal(sell.tokens, 89539.5);
  assert.equal(sell.priceUsd, 0.0143);
  assert.equal(sell.usd, 1288.79);
  const buy = normalizeTrade(raw({ from_token_address: "SOL", to_token_address: "MEME", from_token_amount: "5", to_token_amount: "70000", price_to_in_usd: "0.0144", kind: "buy" }), "MEME");
  assert.equal(buy.side, "buy");
  assert.equal(buy.tokens, 70000);
});

test("when the pool lists the token as the quote side, the pool's own label is ignored", () => {
  // The pool calls this a "sell" of its base token, but our token is what the wallet received.
  const t = normalizeTrade(raw({ kind: "sell", from_token_address: "OTHER", to_token_address: "MEME", to_token_amount: "10" }), "MEME");
  assert.equal(t.side, "buy");
  assert.equal(t.tokens, 10);
});

test("without a mint the pool's label is used", () => {
  assert.equal(normalizeTrade(raw({ kind: "buy" }), null).side, "buy");
});

test("summary nets each wallet and ranks buyers and sellers", () => {
  const t = (wallet, side, usdValue, time = 1) => ({ id: Math.random(), wallet, side, usd: usdValue, time });
  const s = summarize([t("A", "buy", 5000, 5), t("A", "sell", 1000, 9), t("B", "sell", 8000), t("C", "buy", 2000), t("D", "buy", 100), t("D", "sell", 100)]);
  assert.equal(s.buys, 3);
  assert.equal(s.sells, 3);
  assert.equal(s.netUsd, 7100 - 9100);
  assert.equal(s.wallets, 4);
  assert.deepEqual(s.topBuyers.map((w) => w.wallet), ["A", "C"]);
  assert.equal(s.topBuyers[0].netUsd, 4000);
  assert.equal(s.topBuyers[0].last, 9);
  assert.deepEqual(s.topSellers.map((w) => w.wallet), ["B"]);
});

test("an empty list summarises to zeros", () => {
  const s = summarize([]);
  assert.equal(s.netUsd, 0);
  assert.equal(s.topBuyers.length, 0);
});


test("trending pools rejects an empty GeckoTerminal response", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests++;
    assert.ok(String(url).includes("api.geckoterminal.com"));
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  };
  try {
    const { trendingPools } = await import("../lib/whales.js");
    await assert.rejects(trendingPools(), /GeckoTerminal returned no trending pools\. Try again in a minute\./);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
