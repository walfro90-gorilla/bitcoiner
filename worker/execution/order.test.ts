// worker/execution/order.test.ts — Tests de la máquina de estados de orden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, isTerminal, OrderLifecycle } from './order';

test('FSM: transiciones válidas e inválidas', () => {
  assert.equal(canTransition('NEW', 'SENT'), true);
  assert.equal(canTransition('SENT', 'PARTIALLY_FILLED'), true);
  assert.equal(canTransition('SENT', 'FILLED'), true);
  assert.equal(canTransition('PARTIALLY_FILLED', 'FILLED'), true);
  assert.equal(canTransition('NEW', 'FILLED'), false, 'no se puede saltar SENT');
  assert.equal(canTransition('FILLED', 'CANCELED'), false, 'FILLED es terminal');
});

test('FSM: estados terminales no tienen salida', () => {
  for (const s of ['FILLED', 'REJECTED', 'CANCELED', 'EXPIRED'] as const) assert.equal(isTerminal(s), true);
  for (const s of ['NEW', 'SENT', 'PARTIALLY_FILLED'] as const) assert.equal(isTerminal(s), false);
});

test('OrderLifecycle: registra eventos y rechaza transiciones inválidas', () => {
  let t = 1000;
  const lc = new OrderLifecycle(() => t++);
  lc.to('SENT');
  lc.to('FILLED');
  assert.equal(lc.state, 'FILLED');
  assert.equal(lc.events.length, 3); // NEW, SENT, FILLED
  assert.deepEqual(
    lc.events.map((e) => e.to),
    ['NEW', 'SENT', 'FILLED'],
  );
  assert.throws(() => lc.to('CANCELED'), /transición inválida/);
});
