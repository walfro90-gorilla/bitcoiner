// lib/core/stress.test.ts — Estrés ligero (determinista) de invariantes del núcleo, para CI.
// La versión pesada con throughput del motor vive en scripts/stress.ts (`npm run stress`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CandleAggregator,
  buildInventory,
  computeNetProfit,
  conformOrder,
  detectImbalances,
  planRebalance,
  type OrderBook,
  type RebalanceConfig,
  type Venue,
} from './index';
import { flatFees } from './__fixtures__/books';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(7);
const between = (a: number, b: number) => a + r() * (b - a);
function synthBook(venue: Venue, mid: number): OrderBook {
  const side = (sign: number) => Array.from({ length: 8 }, (_, i) => ({ price: mid + sign * (i + 1) * between(0.5, 4), size: between(0.05, 5) }));
  return { venue, base: 'BTC', quote: 'USDT', pair: 'BTC/USDT', bids: side(-1), asks: side(1), exchangeTs: 0, recvTs: Date.now() };
}

test('estrés: el neto nunca supera al bruto y todo es finito (5000 cálculos extremos)', () => {
  const fees = flatFees(10, 10, 0.0002);
  for (let i = 0; i < 5000; i++) {
    const mid = between(50, 120_000);
    const res = computeNetProfit(
      { buyBook: synthBook('kraken', mid), sellBook: synthBook('binance', mid * (1 + between(-50, 250) / 1e4)), fees, targetBase: between(0.0001, 3), slippageBps: between(0, 12), dynamicSlippage: r() > 0.5 },
      5,
    );
    assert.ok(Number.isFinite(res.netUsd) && Number.isFinite(res.grossUsd) && Number.isFinite(res.netSpreadBps), 'finitos');
    assert.ok(res.netUsd <= res.grossUsd + 1e-6, 'neto ≤ bruto');
    assert.ok(res.execBase >= 0, 'execBase no negativo');
  }
});

test('estrés: conformOrder siempre produce múltiplos de los filtros (5000 órdenes)', () => {
  const f = { tickSize: 0.01, stepSize: 0.00001, minNotional: 5, minQty: 0.00001 };
  for (let i = 0; i < 5000; i++) {
    const c = conformOrder(between(1, 120_000), between(0, 5), f);
    if (!c.ok) continue;
    assert.ok(Math.abs(c.qty / f.stepSize - Math.round(c.qty / f.stepSize)) < 1e-4, 'qty múltiplo de stepSize');
    assert.ok(Math.abs(c.price / f.tickSize - Math.round(c.price / f.tickSize)) < 1e-4, 'precio múltiplo de tickSize');
    assert.ok(c.notional >= f.minNotional - 1e-6, 'cumple minNotional');
  }
});

test('estrés: los planes de rebalanceo son válidos (3000 inventarios aleatorios)', () => {
  const cfg: RebalanceConfig = { minOperatingUsd: 20_000, runwayTrades: 3, maxPositionUsd: 10_000, minTransferUsd: 500, maxTransferUsd: 50_000 };
  const venues: Venue[] = ['binance', 'okx', 'kraken', 'bitstamp', 'bitso'];
  const fees = flatFees(10, 10, 0.0002);
  for (let i = 0; i < 3000; i++) {
    const btcUsd = between(40_000, 90_000);
    const snap = venues.flatMap((v) => [
      { venue: v, asset: 'BTC', balance: between(0, 3) },
      { venue: v, asset: 'USDT', balance: between(0, 200_000) },
    ]);
    const inv = buildInventory(snap, btcUsd);
    for (const p of planRebalance(inv, detectImbalances(inv, cfg), fees, cfg, btcUsd)) {
      assert.notEqual(p.fromVenue, p.toVenue, 'nunca a sí mismo');
      assert.ok(p.amount > 0 && p.amountUsd > 0, 'montos positivos');
      assert.ok(p.amountUsd <= cfg.maxTransferUsd + 1e-6, 'respeta el tope');
    }
  }
});

test('estrés: las velas OHLC mantienen low ≤ {o,c} ≤ high (10000 muestras)', () => {
  const agg = new CandleAggregator(60_000);
  let t = 0;
  let price = 60_000;
  for (let i = 0; i < 10_000; i++) {
    price += between(-50, 50);
    t += between(1_000, 8_000);
    const c = agg.add(price, t) ?? agg.current();
    if (!c) continue;
    assert.ok(c.l <= Math.min(c.o, c.c) + 1e-9 && c.h >= Math.max(c.o, c.c) - 1e-9 && c.l <= c.h, 'OHLC coherente');
  }
});
