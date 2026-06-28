// worker/executor.test.ts — Tests de la ejecución simulada (fills, parciales, wallet guard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from './executor';
import { Ledger } from './state';
import { computeNetProfit, type DetectedOpportunity } from './core';
import { book, fees10 } from '../lib/core/__fixtures__/books';

function makeOpp(targetBase = 1): DetectedOpportunity {
  const buyBook = book('kraken', 'USDT', [{ price: 69990, size: 5 }], [{ price: 70000, size: 5 }]);
  const sellBook = book('binance', 'USDT', [{ price: 70250, size: 5 }], [{ price: 70260, size: 5 }]);
  const exec = computeNetProfit({ buyBook, sellBook, fees: fees10, targetBase, slippageBps: 0 }, 0);
  return {
    strategy: 'spatial',
    buyVenue: 'kraken',
    sellVenue: 'binance',
    buyQuote: 'USDT',
    sellQuote: 'USDT',
    pair: 'BTC/USDT',
    grossSpreadBps: exec.grossSpreadBps,
    netSpreadBps: exec.netSpreadBps,
    grossUsd: exec.grossUsd,
    netUsd: exec.netUsd,
    maxExecBase: exec.execBase,
    profitable: exec.profitable,
    exec,
  };
}

test('executor: fill de dos patas mueve el ledger (compra BTC, gasta quote)', () => {
  const led = new Ledger();
  led.set('kraken', 'USDT', 100_000);
  led.set('binance', 'BTC', 2);
  const sim = simulate(makeOpp(1), led, 1e9, 0.05, false); // cap por maxBtcPerTrade 0.05
  assert.equal(sim.status, 'filled', 'llena el tamaño tope completo (0.05)');
  assert.ok(Math.abs(sim.finalBase - 0.05) < 1e-9);
  assert.ok(led.get('kraken', 'BTC') > 0, 'kraken acreditó BTC');
  assert.ok(led.get('kraken', 'USDT') < 100_000, 'kraken gastó quote');
  assert.ok(led.get('binance', 'BTC') < 2, 'binance vendió BTC');
});

test('executor: saldo insuficiente para el tamaño tope produce orden PARCIAL', () => {
  const led = new Ledger();
  led.set('kraken', 'USDT', 100_000);
  led.set('binance', 'BTC', 0.02); // solo 0.02 BTC para vender (< tope 0.05)
  const sim = simulate(makeOpp(1), led, 1e9, 0.05, false);
  assert.equal(sim.status, 'partial', 'menos que el tope → parcial');
  assert.ok(Math.abs(sim.finalBase - 0.02) < 1e-9);
  assert.equal(sim.partial, true);
});

test('executor: wallet guard rechaza si no hay saldo (sin negativos)', () => {
  const led = new Ledger(); // sin fondos
  const sim = simulate(makeOpp(1), led, 1e9, 0.05, false);
  assert.equal(sim.status, 'rejected');
  assert.equal(sim.rejectReason, 'insufficient_balance');
  assert.equal(led.get('kraken', 'BTC'), 0, 'no deja saldos negativos');
});

test('executor: ignoreCaps ejecuta el execBase completo (inyector del reto = +$109.75)', () => {
  const led = new Ledger();
  led.set('kraken', 'USDT', 100_000);
  led.set('binance', 'BTC', 2);
  const sim = simulate(makeOpp(1), led, 1e9, 0.05, true); // ignoreCaps
  assert.ok(Math.abs(sim.finalBase - 1) < 1e-9, '1 BTC completo (ignora caps de tamaño)');
  assert.ok(Math.abs(sim.netPnlUsd - 109.75) < 1e-6, 'neto +$109.75');
  assert.equal(sim.status, 'filled');
});

test('executor: max_position_usd limita el tamaño del fill', () => {
  const led = new Ledger();
  led.set('kraken', 'USDT', 100_000);
  led.set('binance', 'BTC', 2);
  // maxPositionUsd = 35,000 → a ~$70k/BTC, capea ~0.5 BTC (por debajo de maxBtc 1).
  const sim = simulate(makeOpp(1), led, 35_000, 1, false);
  assert.ok(sim.finalBase < 0.51 && sim.finalBase > 0.49, `capeado por USD a ~0.5 BTC (fue ${sim.finalBase})`);
});
