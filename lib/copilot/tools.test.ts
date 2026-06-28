// lib/copilot/tools.test.ts — Tests del registro de tools del copiloto (sin red: cliente Supabase falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COPILOT_TOOLS, toolSchemas, runCopilotTool, type ReadSb } from './tools';

// Cliente Supabase mínimo y encadenable: select/order/limit/eq devuelven el mismo nodo (thenable);
// `await nodo` → { data: rows }; `single()` → { data: rows[0] }.
function fakeSb(tables: Record<string, unknown[]>): ReadSb {
  const make = (rows: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node: any = {
      select: () => node,
      order: () => node,
      limit: () => node,
      eq: () => node,
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return node;
  };
  return { from: (t: string) => make(tables[t] ?? []) } as unknown as ReadSb;
}

test('registro: nombres únicos + JSON Schema válido + descripción', () => {
  const names = COPILOT_TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, 'nombres de tools deben ser únicos');
  for (const t of COPILOT_TOOLS) {
    assert.equal(t.parameters.type, 'object');
    assert.equal(typeof t.parameters.properties, 'object');
    assert.ok(t.description.length > 10, `${t.name} necesita descripción`);
    assert.equal(typeof t.execute, 'function');
  }
});

test('toolSchemas expone {name, description, parameters} para el LLM', () => {
  const s = toolSchemas();
  assert.equal(s.length, COPILOT_TOOLS.length);
  for (const x of s) {
    assert.ok(x.name && x.description && x.parameters);
  }
});

test('seguridad: runCopilotTool rechaza tools fuera de la whitelist', async () => {
  await assert.rejects(() => runCopilotTool('DROP TABLE trades', {}, fakeSb({})), /no permitido/);
  await assert.rejects(() => runCopilotTool('execute_sql', { sql: 'delete from trades' }, fakeSb({})), /no permitido/);
});

test('get_pnl_summary agrega P&L, win rate y parciales', async () => {
  const sb = fakeSb({
    trades: [
      { net_pnl_usd: 10, partial: false },
      { net_pnl_usd: -4, partial: true },
      { net_pnl_usd: 6, partial: false },
    ],
  });
  const r = (await runCopilotTool('get_pnl_summary', {}, sb)) as {
    trades: number; net_pnl_usd: number; win_rate_pct: number; parciales: number;
  };
  assert.equal(r.trades, 3);
  assert.equal(r.net_pnl_usd, 12);
  assert.equal(r.parciales, 1);
  assert.equal(r.win_rate_pct, 66.67);
});

test('get_wallets une exchange_id → venue legible', async () => {
  const sb = fakeSb({
    wallets: [
      { exchange_id: 1, asset: 'BTC', balance: 0.5 },
      { exchange_id: 2, asset: 'USDT', balance: 1000 },
    ],
    exchanges: [
      { id: 1, venue: 'binance', display_name: 'Binance' },
      { id: 2, venue: 'okx', display_name: 'OKX' },
    ],
  });
  const r = (await runCopilotTool('get_wallets', {}, sb)) as { venue: string; asset: string; balance: number }[];
  assert.deepEqual(r[0], { venue: 'Binance', asset: 'BTC', balance: 0.5 });
  assert.equal(r[1].venue, 'OKX');
});

test('get_rejections cuenta motivos de descarte y separa ejecutadas', async () => {
  const sb = fakeSb({
    opportunities: [
      { skip_reason: 'no_rentable', executed: false, profitable: false },
      { skip_reason: 'no_rentable', executed: false, profitable: false },
      { skip_reason: 'spread_inverted', executed: false, profitable: true },
      { skip_reason: null, executed: true, profitable: true },
    ],
  });
  const r = (await runCopilotTool('get_rejections', {}, sb)) as {
    analizadas: number; ejecutadas: number; descartes: Record<string, number>;
  };
  assert.equal(r.analizadas, 4);
  assert.equal(r.ejecutadas, 1);
  assert.equal(r.descartes['no_rentable'], 2);
  assert.equal(r.descartes['spread_inverted'], 1);
});
