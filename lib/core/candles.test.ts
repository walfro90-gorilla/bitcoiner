// lib/core/candles.test.ts — Tests del agregador OHLC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CandleAggregator } from './candles';

const MIN = 60_000;

test('candles: primera muestra inicia la vela (o=h=l=c), sin emitir', () => {
  const agg = new CandleAggregator(MIN);
  const done = agg.add(100, 0);
  assert.equal(done, null);
  assert.deepEqual(agg.current(), { t: 0, o: 100, h: 100, l: 100, c: 100 });
});

test('candles: muestras dentro del bucket actualizan h/l/c y conservan o', () => {
  const agg = new CandleAggregator(MIN);
  agg.add(100, 0);
  agg.add(105, 10_000); // +10s, mismo minuto
  agg.add(98, 20_000);
  agg.add(102, 30_000);
  assert.deepEqual(agg.current(), { t: 0, o: 100, h: 105, l: 98, c: 102 });
});

test('candles: el cambio de bucket emite la vela cerrada y abre una nueva', () => {
  const agg = new CandleAggregator(MIN);
  agg.add(100, 0);
  agg.add(110, 30_000);
  const closed = agg.add(120, 65_000); // siguiente minuto
  assert.deepEqual(closed, { t: 0, o: 100, h: 110, l: 100, c: 110 });
  assert.deepEqual(agg.current(), { t: 60, o: 120, h: 120, l: 120, c: 120 });
});

test('candles: el timestamp del bucket está en segundos y alineado al minuto', () => {
  const agg = new CandleAggregator(MIN);
  agg.add(100, 90_000); // 1.5 min → bucket = minuto 1 = 60s
  assert.equal(agg.current()?.t, 60);
});

test('candles: ignora precios no positivos o no finitos', () => {
  const agg = new CandleAggregator(MIN);
  agg.add(100, 0);
  agg.add(0, 5_000);
  agg.add(-5, 6_000);
  agg.add(NaN, 7_000);
  assert.deepEqual(agg.current(), { t: 0, o: 100, h: 100, l: 100, c: 100 });
});
