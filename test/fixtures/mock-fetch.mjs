// Test-only preload: stubs globalThis.fetch with fixture responses so a test can
// run the CLI offline. Use it with `node --import test/fixtures/mock-fetch.mjs ...`.
//
// Set MOCK_WATCH=false to make a pool-trades response return an empty list after
// the first call, so the watch loop has nothing new to print.

const MINT = "So11111111111111111111111111111111111111112";
const POOL = "fixture-pool-address";

const pair = {
  chainId: "solana",
  dexId: "raydium",
  pairAddress: POOL,
  baseToken: { address: MINT, name: "Wrapped SOL", symbol: "SOL" },
  quoteToken: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", name: "USD Coin", symbol: "USDC" },
  priceUsd: "219.60",
  liquidity: { usd: 5000000 },
};

// Two trades, newest first as GeckoTerminal returns them.
function trade(id, minutesAgo, kind) {
  const block = new Date(Date.now() - minutesAgo * 60000).toISOString();
  return {
    id,
    type: "trade",
    attributes: {
      block_timestamp: block,
      tx_hash: "sig-" + id,
      tx_from_address: "Wallet" + id,
      kind,
      from_token_address: kind === "buy" ? "USDC" : MINT,
      to_token_address: kind === "buy" ? MINT : "USDC",
      from_token_amount: String(kind === "buy" ? 5000 : 100),
      to_token_amount: String(kind === "buy" ? 100 : 5000),
      price_from_in_usd: "1",
      price_to_in_usd: "219.60",
      volume_in_usd: "50000",
    },
  };
}

const tradesResponse = {
  data: [trade("t2", 5, "buy"), trade("t1", 10, "sell")],
};

let tradeCalls = 0;

globalThis.fetch = async (url) => {
  const target = String(url);
  let body;
  if (target.includes("dexscreener.com/token-pairs")) {
    body = [pair];
  } else if (target.includes("/trades")) {
    tradeCalls++;
    // After the first call, return nothing new unless the test asks otherwise.
    const secondCallEmpty = process.env.MOCK_WATCH !== "true";
    body = secondCallEmpty && tradeCalls > 1 ? { data: [] } : tradesResponse;
  } else {
    body = {};
  }
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  };
};
