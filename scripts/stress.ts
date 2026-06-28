// scripts/stress.ts — Harness de estrés DETERMINISTA in-process (núcleo + engine), sin DB ni red.
// Complementa docs/PRUEBAS-ESTRES.md (que mide el worker en vivo). Corre: `npm run stress`.
// Mide throughput del motor event-driven y verifica INVARIANTES del núcleo bajo carga masiva.
import { Engine } from '../worker/engine';
import {
  CandleAggregator,
  DEFAULT_FEES,
  buildInventory,
  computeNetProfit,
  conformOrder,
  detectImbalances,
  planRebalance,
  type OrderBook,
  type RebalanceConfig,
  type Venue,
} from '../worker/core';

// PRNG sembrado (reproducible) — mulberry32.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(1337);
const between = (a: number, b: number) => a + r() * (b - a);

function synthBook(venue: Venue, quote: 'USDT' | 'USD', mid: number): OrderBook {
  const side = (sign: number) =>
    Array.from({ length: 8 }, (_, i) => ({ price: mid + sign * (i + 1) * between(0.5, 4), size: between(0.05, 5) }));
  return { venue, base: 'BTC', quote, pair: `BTC/${quote}`, bids: side(-1), asks: side(1), exchangeTs: 0, recvTs: Date.now() };
}

async function engineThroughput(n: number) {
  let opps = 0;
  const engine = new Engine(() => {
    opps++;
  });
  engine.setFees(DEFAULT_FEES);
  engine.setMinNetBps(5);
  const venues: Venue[] = ['binance', 'okx', 'kraken', 'bitstamp'];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    engine.onBook(synthBook(venues[i % venues.length], 'USDT', between(59_000, 61_000)));
    await Promise.resolve(); // fuerza el evaluate() coalescido (1 eval por update = presión máxima)
  }
  const ms = performance.now() - t0;
  return { n, ms: Math.round(ms), perSec: Math.round(n / (ms / 1000)), opps, rssMb: Math.round(process.memoryUsage().rss / 1048576) };
}

function coreInvariants(m: number) {
  let violations = 0;
  let nonFinite = 0;
  for (let i = 0; i < m; i++) {
    const mid = between(50, 120_000); // precios extremos
    const buy = synthBook('kraken', 'USDT', mid);
    const sell = synthBook('binance', 'USDT', mid * (1 + between(-50, 250) / 1e4));
    const res = computeNetProfit(
      { buyBook: buy, sellBook: sell, fees: DEFAULT_FEES, targetBase: between(0.0001, 3), slippageBps: between(0, 12), dynamicSlippage: r() > 0.5 },
      5,
    );
    if (![res.netUsd, res.grossUsd, res.netSpreadBps, res.execBase].every(Number.isFinite)) nonFinite++;
    if (res.netUsd > res.grossUsd + 1e-6) violations++; // neto nunca supera al bruto
    if (res.execBase < 0) violations++;
    if (res.profitable !== (res.execBase > 0 && res.netSpreadBps >= 5)) violations++;
  }
  return { m, violations, nonFinite };
}

function rebalanceInvariants(k: number) {
  const cfg: RebalanceConfig = { minOperatingUsd: 20_000, runwayTrades: 3, maxPositionUsd: 10_000, minTransferUsd: 500, maxTransferUsd: 50_000 };
  const venues: Venue[] = ['binance', 'okx', 'kraken', 'bitstamp', 'bitso'];
  let violations = 0;
  for (let i = 0; i < k; i++) {
    const btcUsd = between(40_000, 90_000);
    const snap = venues.flatMap((v) => [
      { venue: v, asset: 'BTC', balance: between(0, 3) },
      { venue: v, asset: 'USDT', balance: between(0, 200_000) },
    ]);
    const inv = buildInventory(snap, btcUsd);
    const plans = planRebalance(inv, detectImbalances(inv, cfg), DEFAULT_FEES, cfg, btcUsd);
    for (const p of plans) {
      if (p.fromVenue === p.toVenue) violations++; // nunca a sí mismo
      if (!(p.amount > 0) || !(p.amountUsd > 0)) violations++;
      if (p.amountUsd > cfg.maxTransferUsd + 1e-6) violations++; // respeta el tope
      if (p.worthwhile && p.amountUsd < cfg.minTransferUsd) violations++; // dead band
    }
  }
  return { k, violations };
}

function precisionInvariants(m: number) {
  const f = { tickSize: 0.01, stepSize: 0.00001, minNotional: 5, minQty: 0.00001 };
  let violations = 0;
  for (let i = 0; i < m; i++) {
    const c = conformOrder(between(1, 120_000), between(0, 5), f);
    if (c.ok) {
      if (Math.abs(c.qty / f.stepSize - Math.round(c.qty / f.stepSize)) > 1e-4) violations++; // múltiplo de stepSize
      if (Math.abs(c.price / f.tickSize - Math.round(c.price / f.tickSize)) > 1e-4) violations++; // múltiplo de tickSize
      if (c.notional < f.minNotional - 1e-6) violations++;
    }
  }
  return { m, violations };
}

function candleInvariants(n: number) {
  const agg = new CandleAggregator(60_000);
  let violations = 0;
  let t = 0;
  let price = 60_000;
  for (let i = 0; i < n; i++) {
    price += between(-50, 50);
    t += between(1_000, 8_000);
    const closed = agg.add(price, t);
    const c = closed ?? agg.current();
    if (c && (c.l > Math.min(c.o, c.c) + 1e-9 || c.h < Math.max(c.o, c.c) - 1e-9 || c.l > c.h)) violations++;
  }
  return { n, violations };
}

async function main() {
  console.log('=== Bitcoiner — estrés del núcleo (determinista, in-process) ===\n');
  const eng = await engineThroughput(20_000);
  const core = coreInvariants(200_000);
  const reb = rebalanceInvariants(20_000);
  const prec = precisionInvariants(200_000);
  const cand = candleInvariants(200_000);

  const rows = [
    ['Engine throughput', `${eng.n} updates · ${eng.ms} ms · ${eng.perSec.toLocaleString()} eval/s · ${eng.opps} opps · RSS ${eng.rssMb} MB`],
    ['Núcleo neto (invariantes)', `${core.m.toLocaleString()} cálculos · ${core.violations} violaciones · ${core.nonFinite} no-finitos`],
    ['Rebalanceo (invariantes)', `${reb.k.toLocaleString()} escenarios · ${reb.violations} violaciones`],
    ['Precisión (invariantes)', `${prec.m.toLocaleString()} órdenes · ${prec.violations} violaciones`],
    ['Velas OHLC (invariantes)', `${cand.n.toLocaleString()} muestras · ${cand.violations} violaciones`],
  ];
  for (const [k, v] of rows) console.log(`  ${k.padEnd(28)} ${v}`);

  const totalViol = core.violations + core.nonFinite + reb.violations + prec.violations + cand.violations;
  console.log(`\n  TOTAL violaciones: ${totalViol}  →  ${totalViol === 0 ? '✅ TODAS LAS INVARIANTES SE CUMPLEN' : '❌ REVISAR'}`);
  process.exit(totalViol === 0 ? 0 : 1);
}

void main();
