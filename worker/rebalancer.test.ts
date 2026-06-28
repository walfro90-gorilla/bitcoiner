// worker/rebalancer.test.ts — Integración de la FSM de rebalanceo (debita origen → acredita destino).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rebalancer, type RebalanceRuntime } from './rebalancer';
import { Ledger } from './state';
import { flatFees } from '../lib/core/__fixtures__/books';
import type { Writer } from './writer';

const cfg: RebalanceRuntime = {
  auto: true,
  minOperatingUsd: 20_000,
  runwayTrades: 3,
  maxPositionUsd: 10_000,
  minTransferUsd: 500,
  maxTransferUsd: 50_000,
};

test('rebalancer: en AUTO mueve BTC del venue con excedente al starved (FSM in_transit → completed)', async () => {
  const led = new Ledger();
  led.set('binance', 'BTC', 3); // $180k (excedente)
  led.set('binance', 'USDT', 100_000);
  led.set('kraken', 'BTC', 0.1); // $6k (< piso 30k → starved)
  led.set('kraken', 'USDT', 100_000);

  const inserted: Record<string, unknown>[] = [];
  const updated: Array<{ id: number; patch: Record<string, unknown> }> = [];
  const writer = {
    exId: (v: string) => (({ binance: 1, kraken: 3 }) as Record<string, number>)[v] ?? null,
    upsertWallets: async () => {},
    insertTransfer: async (row: Record<string, unknown>) => {
      inserted.push(row);
      return 1;
    },
    updateTransfer: async (id: number, patch: Record<string, unknown>) => {
      updated.push({ id, patch });
    },
  } as unknown as Writer;

  const reb = new Rebalancer(led, () => 60_000, () => flatFees(10, 10, 0.0002), () => cfg, writer, 15);
  reb.runOnce();
  await new Promise((r) => setTimeout(r, 0)); // deja que execute() corra sus awaits y agende la transferencia

  // Tras agendar: origen debitado + transferencia insertada en tránsito.
  assert.equal(inserted.length, 1, 'inserta una transferencia');
  assert.equal(inserted[0].status, 'in_transit');
  assert.equal(inserted[0].asset, 'BTC');
  assert.ok(Math.abs((inserted[0].amount as number) - 0.4) < 1e-9, 'mueve 0.4 BTC (24k/60k)');
  assert.ok(Math.abs(led.get('binance', 'BTC') - 2.6) < 1e-9, 'origen debitado de inmediato (3 - 0.4)');
  assert.ok(Math.abs(led.get('kraken', 'BTC') - 0.1) < 1e-9, 'destino aún sin acreditar (en tránsito)');

  // Tras el ETA: destino acreditado (menos costo) + transferencia completada.
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(led.get('kraken', 'BTC') > 0.49, 'destino acreditado tras ETA (0.1 + ~0.3998)');
  assert.equal(updated.length, 1, 'marca completada');
  assert.equal(updated[0].patch.status, 'completed');
});

test('rebalancer: con AUTO OFF no ejecuta nada', async () => {
  const led = new Ledger();
  led.set('binance', 'BTC', 3);
  led.set('kraken', 'BTC', 0.1);
  const inserted: unknown[] = [];
  const writer = {
    exId: (v: string) => (({ binance: 1, kraken: 3 }) as Record<string, number>)[v] ?? null,
    upsertWallets: async () => {},
    insertTransfer: async () => {
      inserted.push(1);
      return 1;
    },
    updateTransfer: async () => {},
  } as unknown as Writer;
  const reb = new Rebalancer(led, () => 60_000, () => flatFees(10, 10, 0.0002), () => ({ ...cfg, auto: false }), writer, 15);
  reb.runOnce();
  assert.equal(inserted.length, 0, 'AUTO OFF → ninguna transferencia');
});
