// lib/core/rebalance.property.test.ts — Property-based del rebalanceo inteligente (Pilar 3).
// Genera inventarios y configs aleatorios y verifica que TODO plan sea válido y consistente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { buildInventory, detectImbalances, planRebalance, operatingFloor, type RebalanceConfig } from './rebalance';
import { DEFAULT_FEES } from './fees';
import type { Venue } from './types';

const VENUES: Venue[] = ['binance', 'okx', 'kraken', 'bitso'];

const cfgArb = fc
  .record({
    minOperatingUsd: fc.double({ min: 1000, max: 20000, noNaN: true, noDefaultInfinity: true }),
    runwayTrades: fc.integer({ min: 1, max: 10 }),
    maxPositionUsd: fc.double({ min: 1000, max: 10000, noNaN: true, noDefaultInfinity: true }),
    minTransferUsd: fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
    maxTransferUsd: fc.double({ min: 1000, max: 100000, noNaN: true, noDefaultInfinity: true }),
  })
  .map((c): RebalanceConfig => c);

// Snapshot: por cada venue, un balance BTC y uno de quote (USDT).
const snapshotArb = fc.array(
  fc.record({
    venue: fc.constantFrom(...VENUES),
    btc: fc.double({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
    quote: fc.double({ min: 0, max: 300000, noNaN: true, noDefaultInfinity: true }),
  }),
  { minLength: 2, maxLength: 4 },
);

test('property: todo plan de rebalanceo es válido y consistente', () => {
  fc.assert(
    fc.property(
      snapshotArb,
      cfgArb,
      fc.double({ min: 20000, max: 80000, noNaN: true, noDefaultInfinity: true }), // btcUsd
      (rows, cfg, btcUsd) => {
        const snapshot = rows.flatMap((r) => [
          { venue: r.venue, asset: 'BTC', balance: r.btc },
          { venue: r.venue, asset: 'USDT', balance: r.quote },
        ]);
        const inv = buildInventory(snapshot, btcUsd);
        // Inventario consistente.
        for (const v of inv) {
          assert.ok(Number.isFinite(v.totalUsd) && v.totalUsd >= -1e-6);
          assert.ok(Math.abs(v.totalUsd - (v.btcUsd + v.quoteUsd)) < 1e-3);
        }
        const plans = planRebalance(inv, detectImbalances(inv, cfg), DEFAULT_FEES, cfg, btcUsd);
        for (const p of plans) {
          assert.ok(p.fromVenue !== p.toVenue, 'ruta origen==destino');
          assert.ok(p.amount > 0 && Number.isFinite(p.amount), `amount inválido: ${p.amount}`);
          assert.ok(p.amountUsd > 0, `amountUsd<=0: ${p.amountUsd}`);
          assert.ok(p.amountUsd <= cfg.maxTransferUsd + 1e-6, 'amountUsd > maxTransfer');
          assert.ok(p.costUsd >= 0, `costo negativo: ${p.costUsd}`);
          if (p.worthwhile) assert.ok(p.amountUsd >= cfg.minTransferUsd - 1e-9, 'worthwhile bajo banda muerta');
        }
      },
    ),
    { numRuns: 400 },
  );
});

test('property: operatingFloor = max(minOperating, runway × maxPosition)', () => {
  fc.assert(
    fc.property(cfgArb, (cfg) => {
      assert.equal(operatingFloor(cfg), Math.max(cfg.minOperatingUsd, cfg.runwayTrades * cfg.maxPositionUsd));
    }),
    { numRuns: 200 },
  );
});
