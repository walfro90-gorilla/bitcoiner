// lib/core/profit.property.test.ts — Property-based (fast-check) del corazón del bot.
// En vez de casos puntuales, genera miles de libros/fees aleatorios y verifica INVARIANTES que
// deben cumplirse SIEMPRE (robustez de grado institucional, Pilar 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { computeNetProfit } from './profit';
import type { OrderBook, Venue, Quote } from './types';
import { book, flatFees } from './__fixtures__/books';

// Arbitrary de un OrderBook válido: bids descendentes, asks ascendentes, tamaños > 0, ask > bid.
function bookArb(venue: Venue, quote: Quote) {
  return fc
    .tuple(
      fc.double({ min: 5000, max: 150000, noNaN: true, noDefaultInfinity: true }), // mid
      fc.double({ min: 0.00005, max: 0.01, noNaN: true, noDefaultInfinity: true }), // half-spread
      fc.array(fc.double({ min: 0.001, max: 20, noNaN: true, noDefaultInfinity: true }), { minLength: 3, maxLength: 8 }),
    )
    .map(([mid, hs, sizes]): OrderBook => {
      const ask0 = mid * (1 + hs);
      const bid0 = mid * (1 - hs);
      const asks = sizes.map((s, i) => ({ price: ask0 * (1 + i * 0.0005), size: s }));
      const bids = sizes.map((s, i) => ({ price: bid0 * (1 - i * 0.0005), size: s }));
      return book(venue, quote, bids, asks);
    });
}

test('property: salidas finitas + execBase acotado + neto ≤ bruto (siempre)', () => {
  fc.assert(
    fc.property(
      bookArb('binance', 'USDT'),
      bookArb('kraken', 'USDT'),
      fc.double({ min: 0.01, max: 5, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 0, max: 60, noNaN: true, noDefaultInfinity: true }), // takerBps ≥ 0
      fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true }), // slippageBps ≥ 0
      (buy, sell, target, takerBps, slipBps) => {
        const r = computeNetProfit({
          buyBook: buy,
          sellBook: sell,
          fees: flatFees(takerBps, takerBps, 0),
          targetBase: target,
          slippageBps: slipBps,
          depegBps: 0,
        });
        for (const v of [r.netSpreadBps, r.grossSpreadBps, r.netUsd, r.grossUsd, r.execBase]) {
          assert.ok(Number.isFinite(v), `salida no finita: ${v}`);
        }
        assert.ok(r.execBase >= 0 && r.execBase <= target + 1e-9, `execBase fuera de rango: ${r.execBase}`);
        // Costos (fees + slippage) son no negativos → el neto nunca supera al bruto.
        assert.ok(r.netSpreadBps <= r.grossSpreadBps + 1e-6, `neto ${r.netSpreadBps} > bruto ${r.grossSpreadBps}`);
      },
    ),
    { numRuns: 400 },
  );
});

test('property: sin costos (fees=0, slip=0, depeg=0, sin withdrawal) ⇒ neto == bruto', () => {
  fc.assert(
    fc.property(
      bookArb('binance', 'USDT'),
      bookArb('kraken', 'USDT'),
      fc.double({ min: 0.01, max: 3, noNaN: true, noDefaultInfinity: true }),
      (buy, sell, target) => {
        const r = computeNetProfit({
          buyBook: buy,
          sellBook: sell,
          fees: flatFees(0, 0, 0),
          targetBase: target,
          slippageBps: 0,
          depegBps: 0,
          includeWithdrawal: false,
        });
        if (r.execBase > 0) assert.ok(Math.abs(r.netSpreadBps - r.grossSpreadBps) < 1e-6);
      },
    ),
    { numRuns: 300 },
  );
});
