// lib/core/precision.property.test.ts — Property-based de la precisión en el borde de ejecución.
// Invariante clave: tras conformar, precio y cantidad SON múltiplos exactos de tick/step (si no, el
// exchange real rechaza la orden). Miles de combinaciones aleatorias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { toSatoshis, fromSatoshis, roundToStep, roundToTick, conformOrder } from './precision';

const STEPS = [1, 0.5, 0.25, 0.1, 0.01, 0.001, 0.0001, 0.00001];
const stepArb = fc.constantFrom(...STEPS);
const valueArb = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

// ¿`value` es múltiplo de `step`? Tolerancia ABSOLUTA escalada a la magnitud (el chequeo por ratio
// value/step pierde precisión cuando value/step ~1e11, p.ej. 1e6 / 1e-5).
function isMultiple(value: number, step: number): boolean {
  if (!(step > 0)) return true;
  const n = Math.round(value / step);
  const tol = Math.max(1e-9, Math.abs(value) * 1e-9);
  return Math.abs(value - n * step) <= tol;
}

test('property: roundToStep/roundToTick devuelven múltiplos exactos del incremento', () => {
  fc.assert(
    fc.property(valueArb, stepArb, (v, step) => {
      const floor = roundToStep(v, step, 'floor');
      const near = roundToStep(v, step, 'nearest');
      const tick = roundToTick(v, step);
      assert.ok(isMultiple(floor, step), `floor ${floor} no es múltiplo de ${step}`);
      assert.ok(isMultiple(near, step), `nearest ${near} no es múltiplo de ${step}`);
      assert.ok(isMultiple(tick, step), `tick ${tick} no es múltiplo de ${step}`);
      // floor nunca sobrepasa el valor (no inventa cantidad) salvo epsilon de redondeo.
      assert.ok(floor <= v + step * 1e-6, `floor ${floor} > valor ${v}`);
    }),
    { numRuns: 500 },
  );
});

test('property: conformOrder produce precio/cantidad conformes y respeta mínimos', () => {
  fc.assert(
    fc.property(
      fc.double({ min: 1, max: 200000, noNaN: true, noDefaultInfinity: true }), // price
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }), // qty
      stepArb, // tickSize
      stepArb, // stepSize
      fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }), // minNotional
      (price, qty, tickSize, stepSize, minNotional) => {
        const c = conformOrder(price, qty, { tickSize, stepSize, minNotional, minQty: stepSize });
        assert.ok(isMultiple(c.price, tickSize), `precio ${c.price} no múltiplo de tick ${tickSize}`);
        assert.ok(isMultiple(c.qty, stepSize), `qty ${c.qty} no múltiplo de step ${stepSize}`);
        if (c.ok) {
          assert.ok(c.qty > 0, 'orden ok pero qty<=0');
          assert.ok(c.notional >= minNotional - 1e-6, `ok pero notional ${c.notional} < min ${minNotional}`);
        }
      },
    ),
    { numRuns: 500 },
  );
});

test('property: satoshis round-trip dentro de 1 satoshi', () => {
  fc.assert(
    fc.property(fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }), (btc) => {
      const rt = fromSatoshis(toSatoshis(btc));
      assert.ok(rt <= btc + 1e-9, 'round-trip inventó BTC');
      assert.ok(btc - rt < 1 / 1e8 + 1e-9, `pérdida > 1 satoshi: ${btc - rt}`);
    }),
    { numRuns: 500 },
  );
});
