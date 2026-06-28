// lib/core/rebalance.test.ts — Tests del núcleo de rebalanceo inteligente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInventory, detectImbalances, planRebalance, operatingFloor, type RebalanceConfig } from './rebalance';
import { flatFees } from './__fixtures__/books';

const BTC_USD = 60_000;
const cfg: RebalanceConfig = {
  minOperatingUsd: 20_000,
  runwayTrades: 3,
  maxPositionUsd: 10_000,
  minTransferUsd: 500,
  maxTransferUsd: 50_000,
};
// floor = max(20000, 3*10000) = 30000

test('operatingFloor = max(minOperating, runway*maxPosition)', () => {
  assert.equal(operatingFloor(cfg), 30_000);
});

test('buildInventory agrega BTC + quote en USD e ignora MXN', () => {
  const inv = buildInventory(
    [
      { venue: 'binance', asset: 'BTC', balance: 2 },
      { venue: 'binance', asset: 'USDT', balance: 50_000 },
      { venue: 'bitso', asset: 'MXN', balance: 1_000_000 },
      { venue: 'bitso', asset: 'BTC', balance: 1 },
    ],
    BTC_USD,
  );
  const bin = inv.find((v) => v.venue === 'binance')!;
  assert.equal(bin.btcUsd, 120_000);
  assert.equal(bin.quoteUsd, 50_000);
  assert.equal(bin.totalUsd, 170_000);
  const bit = inv.find((v) => v.venue === 'bitso')!;
  assert.equal(bit.quoteUsd, 0, 'MXN no cuenta como quote rebalanceable');
  assert.equal(bit.btcUsd, 60_000);
});

test('detectImbalances marca starvation por debajo del piso', () => {
  const inv = buildInventory(
    [
      { venue: 'kraken', asset: 'BTC', balance: 0.1 }, // $6,000 < 30,000 → btc_starved
      { venue: 'kraken', asset: 'USDT', balance: 100_000 }, // ok
      { venue: 'binance', asset: 'BTC', balance: 2 }, // $120,000 ok
      { venue: 'binance', asset: 'USDT', balance: 100_000 }, // ok
    ],
    BTC_USD,
  );
  const imb = detectImbalances(inv, cfg);
  assert.equal(imb.length, 1);
  assert.equal(imb[0].venue, 'kraken');
  assert.equal(imb[0].reason, 'btc_starved');
  assert.ok(Math.abs(imb[0].deficitUsd - 24_000) < 1e-6);
});

test('planRebalance elige el origen con más excedente y dimensiona al déficit (worthwhile)', () => {
  const inv = buildInventory(
    [
      { venue: 'kraken', asset: 'BTC', balance: 0.1 }, // déficit BTC 24,000
      { venue: 'kraken', asset: 'USDT', balance: 100_000 },
      { venue: 'binance', asset: 'BTC', balance: 2 }, // excedente BTC 90,000
      { venue: 'binance', asset: 'USDT', balance: 100_000 },
    ],
    BTC_USD,
  );
  const imb = detectImbalances(inv, cfg);
  const plans = planRebalance(inv, imb, flatFees(10, 10, 0.0002), cfg, BTC_USD);
  assert.equal(plans.length, 1);
  const p = plans[0];
  assert.equal(p.fromVenue, 'binance');
  assert.equal(p.toVenue, 'kraken');
  assert.equal(p.asset, 'BTC');
  assert.ok(Math.abs(p.amountUsd - 24_000) < 1e-6, 'mueve hasta el piso');
  assert.ok(Math.abs(p.amount - 0.4) < 1e-9, '24000/60000 = 0.4 BTC');
  assert.ok(Math.abs(p.costUsd - 12) < 1e-6, 'withdrawal 0.0002 BTC * 60000 = $12');
  assert.equal(p.worthwhile, true, '$12 de costo sobre $24k movido = 0.05% → vale la pena');
});

test('planRebalance NO marca worthwhile movimientos por debajo de la banda muerta', () => {
  const inv = buildInventory(
    [
      { venue: 'kraken', asset: 'BTC', balance: 29_800 / BTC_USD }, // déficit ~200 (< minTransfer 500)
      { venue: 'kraken', asset: 'USDT', balance: 100_000 },
      { venue: 'binance', asset: 'BTC', balance: 2 },
      { venue: 'binance', asset: 'USDT', balance: 100_000 },
    ],
    BTC_USD,
  );
  const imb = detectImbalances(inv, cfg);
  const plans = planRebalance(inv, imb, flatFees(10, 10, 0.0002), cfg, BTC_USD);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].worthwhile, false, 'mover $200 no vale la pena (banda muerta + costo relativo)');
});
