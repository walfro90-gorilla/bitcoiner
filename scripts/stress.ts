// scripts/stress.ts — Harness de estrés DETERMINISTA in-process (núcleo + engine), sin DB ni red.
// Complementa docs/PRUEBAS-ESTRES.md (que mide el worker en vivo). Corre: `npm run stress`.
// Mide throughput del motor event-driven y verifica INVARIANTES del núcleo bajo carga masiva.
import { Engine } from '../worker/engine';
import { SimulatedAdapter } from '../worker/execution/simulatedAdapter';
import { Ledger, type MarketState } from '../worker/state';
import { canTransition, isTerminal } from '../worker/execution/order';
import { L2Book } from '../worker/feeds/l2book';
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
  const venues: Venue[] = ['binance', 'okx', 'kraken', 'bitstamp', 'coinbase', 'bybit'];
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
  const venues: Venue[] = ['binance', 'okx', 'kraken', 'bitstamp', 'bitso', 'coinbase', 'bybit'];
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

// Libro adversarial: a veces vacío, a veces 1–4 niveles delgados (estresa el manejo de poca liquidez).
function thinBook(mid: number): OrderBook {
  const n = Math.floor(between(0, 4.999));
  const side = (sign: number) => Array.from({ length: n }, (_, i) => ({ price: mid + sign * (i + 1) * between(0.5, 5), size: between(0, 2) }));
  return { venue: 'binance', base: 'BTC', quote: 'USDT', pair: 'BTC/USDT', bids: side(-1), asks: side(1), exchangeTs: 0, recvTs: Date.now() };
}

// FSM bajo fault storm: órdenes aleatorias (incl. qty 0, libros vacíos/delgados) por el SimulatedAdapter.
// Invariante: el estado final SIEMPRE es terminal y cada transición de la FSM es válida (nunca un salto ilegal).
async function fsmFaultStorm(k: number) {
  let violations = 0;
  for (let i = 0; i < k; i++) {
    const ledger = new Ledger();
    ledger.set('binance', 'USDT', between(0, 200_000));
    ledger.set('binance', 'BTC', between(0, 5));
    const books = new Map<string, OrderBook>();
    if (r() > 0.15) books.set('binance:BTC/USDT', thinBook(between(50, 120_000))); // 15% sin libro
    const state = { get: (key: string) => books.get(key) } as unknown as MarketState;
    const adapter = new SimulatedAdapter('binance', state, ledger, () => DEFAULT_FEES);
    const res = await adapter.placeOrder({
      venue: 'binance',
      symbol: 'BTCUSDT',
      side: r() > 0.5 ? 'buy' : 'sell',
      type: r() > 0.5 ? 'market' : 'limit',
      qty: between(0, 2),
      limitPrice: between(50, 120_000),
    });
    // Un placeOrder concluye en FILLED, REJECTED (terminales) o PARTIALLY_FILLED (descansa esperando más fill).
    const validEnd = isTerminal(res.state) || res.state === 'PARTIALLY_FILLED';
    if (!validEnd) violations++;
    for (let j = 1; j < res.events.length; j++) {
      const e = res.events[j];
      if (e.from && !canTransition(e.from, e.to)) violations++; // transición ilegal de la FSM
    }
  }
  return { k, violations };
}

// L2Book incremental (Coinbase/Bybit): snapshot/delta/borrados aleatorios. Invariante: el top siempre
// queda ordenado (bids desc, asks asc) y sin tamaños no positivos.
function l2BookStorm(k: number) {
  const lb = new L2Book();
  let violations = 0;
  for (let i = 0; i < k; i++) {
    if (r() < 0.04) lb.reset();
    lb.apply(r() > 0.5 ? 'bid' : 'ask', between(50, 120_000), r() < 0.12 ? 0 : between(0, 10)); // 12% borra (size 0)
    if (i % 40 === 0) {
      const { bids, asks } = lb.top(20);
      for (let j = 1; j < bids.length; j++) if (bids[j].price > bids[j - 1].price) violations++;
      for (let j = 1; j < asks.length; j++) if (asks[j].price < asks[j - 1].price) violations++;
      for (const l of [...bids, ...asks]) if (!(l.size > 0)) violations++;
    }
  }
  return { k, violations };
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
  const fsm = await fsmFaultStorm(50_000);
  const l2 = l2BookStorm(200_000);

  const rows = [
    ['Engine throughput (7 venues)', `${eng.n} updates · ${eng.ms} ms · ${eng.perSec.toLocaleString()} eval/s · ${eng.opps} opps · RSS ${eng.rssMb} MB`],
    ['Núcleo neto (invariantes)', `${core.m.toLocaleString()} cálculos · ${core.violations} violaciones · ${core.nonFinite} no-finitos`],
    ['Rebalanceo (invariantes)', `${reb.k.toLocaleString()} escenarios · ${reb.violations} violaciones`],
    ['Precisión (invariantes)', `${prec.m.toLocaleString()} órdenes · ${prec.violations} violaciones`],
    ['Velas OHLC (invariantes)', `${cand.n.toLocaleString()} muestras · ${cand.violations} violaciones`],
    ['FSM fault storm (ejecución)', `${fsm.k.toLocaleString()} órdenes adversariales · ${fsm.violations} violaciones`],
    ['Libro L2 incremental', `${l2.k.toLocaleString()} ops snapshot/delta · ${l2.violations} violaciones`],
  ];
  for (const [k, v] of rows) console.log(`  ${k.padEnd(30)} ${v}`);

  const totalViol = core.violations + core.nonFinite + reb.violations + prec.violations + cand.violations + fsm.violations + l2.violations;
  console.log(`\n  TOTAL violaciones: ${totalViol}  →  ${totalViol === 0 ? '✅ TODAS LAS INVARIANTES SE CUMPLEN' : '❌ REVISAR'}`);
  process.exit(totalViol === 0 ? 0 : 1);
}

void main();
