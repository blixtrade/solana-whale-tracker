import { getJson } from "./core.js";

const GECKO = "https://api.geckoterminal.com/api/v2/networks/solana";

/** Poll interval in seconds from --watch: bare flag -> 30, <n> -> max(20, n), absent -> 0. */
export function watchSeconds(value) {
  if (value === undefined || value === false) return 0;
  if (value === true) return 30;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("--watch must be a number of seconds.");
  return Math.max(20, n);
}

/** Token name, ticker and its deepest pools (from DexScreener, to save GeckoTerminal calls). */
export async function findPools(mint, count = 3) {
  const pairs = await getJson(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`);
  const list = (Array.isArray(pairs) ? pairs : [])
    .filter((p) => p.baseToken?.address === mint || p.quoteToken?.address === mint)
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  if (!list.length) throw new Error("No pools found for this mint. It may be on the pump.fun bonding curve, or not a token.");
  const top = list[0];
  const token = top.baseToken?.address === mint ? top.baseToken : top.quoteToken;
  const pools = list.slice(0, count).map((p) => ({ address: p.pairAddress, name: `${p.baseToken.symbol} / ${p.quoteToken.symbol}`, liq: p.liquidity?.usd || 0, dex: p.dexId }));
  return { mint, symbol: token.symbol, name: token.name, priceUsd: top.baseToken?.address === mint ? Number(top.priceUsd) || null : null, pools };
}

/** The pools GeckoTerminal lists as trending on Solana right now. */
export async function trendingPools(count = 5) {
  const res = await getJson(`${GECKO}/trending_pools?include=base_token`);
  const tokens = new Map((res.included || []).map((t) => [t.id, t.attributes]));
  if (!res.data?.length) throw new Error("GeckoTerminal returned no trending pools. Try again in a minute.");
  return (res.data || []).slice(0, count).map((p) => {
    const t = tokens.get(p.relationships?.base_token?.data?.id) || {};
    return { address: p.attributes.address, name: p.attributes.name, liq: Number(p.attributes.reserve_in_usd) || 0, mint: t.address || null, symbol: t.symbol || p.attributes.name.split(" / ")[0] };
  });
}

/** One raw trade -> a flat record, seen from the side of `mint`. */
export function normalizeTrade(raw, mint, extra = {}) {
  const a = raw.attributes;
  const buying = mint ? a.to_token_address === mint : a.kind === "buy";
  return {
    id: raw.id,
    time: Date.parse(a.block_timestamp),
    side: buying ? "buy" : "sell",
    wallet: a.tx_from_address,
    usd: Number(a.volume_in_usd) || 0,
    tokens: Number(buying ? a.to_token_amount : a.from_token_amount) || 0,
    priceUsd: Number(buying ? a.price_to_in_usd : a.price_from_in_usd) || null,
    signature: a.tx_hash,
    ...extra,
  };
}

/** Large trades in one pool over the last 24 hours (the API returns at most 300). */
export async function poolTrades(pool, minUsd, mint, extra) {
  let res;
  try {
    res = await getJson(`${GECKO}/pools/${pool}/trades?trade_volume_in_usd_greater_than=${minUsd}`);
  } catch (err) {
    if (err.status === 404) return []; // GeckoTerminal does not index every pool (e.g. bonding curves)
    throw err;
  }
  return (res.data || []).map((t) => normalizeTrade(t, mint, extra));
}

/** Large trades across several pools, newest first, without duplicates. */
export async function loadTrades(pools, minUsd, mint) {
  const all = new Map();
  for (let i = 0; i < pools.length; i++) {
    const p = pools[i];
    for (const t of await poolTrades(p.address, minUsd, mint ?? p.mint, { pool: p.address, symbol: p.symbol })) all.set(t.id, t);
  }
  return [...all.values()].sort((a, b) => b.time - a.time);
}

/** Totals and a per-wallet leaderboard. Pure function. */
export function summarize(trades) {
  const wallets = new Map();
  const totals = { buys: 0, sells: 0, buyUsd: 0, sellUsd: 0 };
  for (const t of trades) {
    if (!wallets.has(t.wallet)) wallets.set(t.wallet, { wallet: t.wallet, buys: 0, sells: 0, buyUsd: 0, sellUsd: 0, last: 0 });
    const w = wallets.get(t.wallet);
    if (t.side === "buy") { w.buys++; w.buyUsd += t.usd; totals.buys++; totals.buyUsd += t.usd; }
    else { w.sells++; w.sellUsd += t.usd; totals.sells++; totals.sellUsd += t.usd; }
    w.last = Math.max(w.last, t.time);
  }
  const list = [...wallets.values()].map((w) => ({ ...w, netUsd: w.buyUsd - w.sellUsd, volumeUsd: w.buyUsd + w.sellUsd }));
  return {
    ...totals,
    netUsd: totals.buyUsd - totals.sellUsd,
    wallets: list.length,
    topBuyers: list.filter((w) => w.netUsd > 0).sort((a, b) => b.netUsd - a.netUsd),
    topSellers: list.filter((w) => w.netUsd < 0).sort((a, b) => a.netUsd - b.netUsd),
  };
}
