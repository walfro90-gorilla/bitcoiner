// worker/execution/simulatedAdapter.test.ts — El adapter simulado llena contra el libro en RAM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimulatedAdapter } from './simulatedAdapter';
import { MarketState, Ledger } from '../state';
import { book, flatFees } from '../../lib/core/__fixtures__/books';

function setup() {
  const state = new MarketState();
  state.setBook(book('binance', 'USDT', [{ price: 60000, size: 5 }], [{ price: 60010, size: 5 }]));
  const led = new Ledger();
  led.set('binance', 'USDT', 100_000);
  led.set('binance', 'BTC', 1);
  const sim = new SimulatedAdapter('binance', state, led, () => flatFees(10, 10, 0));
  return { sim, led };
}

test('SimulatedAdapter: market buy llena al mejor ask y actualiza el ledger (FSM NEW→SENT→FILLED)', async () => {
  const { sim, led } = setup();
  const r = await sim.placeOrder({ venue: 'binance', symbol: 'BTCUSDT', side: 'buy', type: 'market', qty: 0.01 });
  assert.equal(r.state, 'FILLED');
  assert.ok(Math.abs(r.avgPrice - 60010) < 1e-9, 'llena al mejor ask');
  assert.ok(Math.abs(r.filledQty - 0.01) < 1e-9);
  assert.deepEqual(r.events.map((e) => e.to), ['NEW', 'SENT', 'FILLED']);

  const notional = 60010 * 0.01;
  const fee = notional * 0.001;
  assert.ok(Math.abs(led.get('binance', 'BTC') - 1.01) < 1e-9, 'acredita BTC');
  assert.ok(Math.abs(led.get('binance', 'USDT') - (100_000 - notional - fee)) < 1e-6, 'debita quote + fee');
});

test('SimulatedAdapter: market sell debita BTC y acredita quote', async () => {
  const { sim, led } = setup();
  const r = await sim.placeOrder({ venue: 'binance', symbol: 'BTCUSDT', side: 'sell', type: 'market', qty: 0.02 });
  assert.equal(r.state, 'FILLED');
  assert.ok(Math.abs(r.avgPrice - 60000) < 1e-9, 'vende al mejor bid');
  assert.ok(Math.abs(led.get('binance', 'BTC') - 0.98) < 1e-9, 'debita BTC');
});

test('SimulatedAdapter: rechaza si no hay libro (REJECTED no_book)', async () => {
  const { sim } = setup();
  const r = await sim.placeOrder({ venue: 'binance', symbol: 'ETHUSDT', side: 'buy', type: 'market', qty: 0.01 });
  assert.equal(r.state, 'REJECTED');
  assert.equal(r.rejectReason, 'no_book');
});
