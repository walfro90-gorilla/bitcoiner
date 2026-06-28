// lib/core/precision.test.ts — Tests de la precisión en el borde de ejecución.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSatoshis, fromSatoshis, roundToStep, roundToTick, decimalsOf, conformOrder } from './precision';

test('satoshis: BTC <-> satoshis exacto (entero)', () => {
  assert.equal(toSatoshis(1), 100_000_000);
  assert.equal(toSatoshis(0.05), 5_000_000);
  assert.equal(toSatoshis(0.123456789), 12_345_678); // floor a satoshi
  assert.equal(fromSatoshis(5_000_000), 0.05);
});

test('decimalsOf: cuenta decimales del step', () => {
  assert.equal(decimalsOf(0.01), 2);
  assert.equal(decimalsOf(0.00001), 5);
  assert.equal(decimalsOf(1), 0);
  assert.equal(decimalsOf(0.5), 1);
});

test('roundToStep: estable ante drift de float (0.1+0.2)', () => {
  assert.equal(roundToStep(0.3, 0.1, 'floor'), 0.3);
  assert.equal(roundToStep(0.30000000000000004, 0.1, 'nearest'), 0.3);
  assert.equal(roundToStep(0.057, 0.00001, 'floor'), 0.057);
  assert.equal(roundToStep(0.0573219, 0.001, 'floor'), 0.057); // floor al step
});

test('roundToTick: redondea precio al tickSize más cercano', () => {
  assert.equal(roundToTick(60137.183, 0.01), 60137.18);
  assert.equal(roundToTick(60137.186, 0.01), 60137.19);
  assert.equal(roundToTick(60141.3, 0.1), 60141.3);
});

test('conformOrder: conforma a filtros y rechaza por debajo de mínimos', () => {
  const f = { tickSize: 0.01, stepSize: 0.00001, minNotional: 10, minQty: 0.00001 };
  const ok = conformOrder(60000.007, 0.0512345, f);
  assert.equal(ok.ok, true);
  assert.equal(ok.price, 60000.01);
  assert.equal(ok.qty, 0.05123); // floor al stepSize
  assert.ok(ok.notional > 10);

  // Notional por debajo del mínimo → rechazado (como lo haría el exchange real).
  const tooSmall = conformOrder(60000, 0.0000001, f);
  assert.equal(tooSmall.ok, false);
  assert.ok(tooSmall.reason === 'min_qty' || tooSmall.reason === 'min_notional' || tooSmall.reason === 'zero_qty');
});
