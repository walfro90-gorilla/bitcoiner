// lib/copilot/tools.ts — Herramientas READ-ONLY del copiloto (tool-use).
// El LLM puede invocar estas funciones para consultar datos EN VIVO de la DB y justificar
// sus respuestas con cifras reales. SOLO lectura: cada tool ejecuta un SELECT acotado y
// parametrizado (NO acepta SQL arbitrario). El loop de tool-calling vive en lib/llm.ts.
// Diseñado sin imports → 100% testeable con un cliente Supabase falso.

// Tipo mínimo del cliente Supabase (lectura). El cliente real es createAdminClient() (service-role).
type Thenable<T> = PromiseLike<{ data: T | null; error: unknown }>;
type Query = {
  select: (cols?: string) => Query;
  order: (col: string, opts?: { ascending?: boolean }) => Query;
  limit: (n: number) => Query & Thenable<unknown[]>;
  eq: (col: string, val: unknown) => Query;
  single: () => Thenable<unknown>;
} & Thenable<unknown[]>;
export type ReadSb = { from: (table: string) => Query };

export interface CopilotTool {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  execute: (args: Record<string, unknown>, sb: ReadSb) => Promise<unknown>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export const COPILOT_TOOLS: CopilotTool[] = [
  {
    name: 'get_pnl_summary',
    description:
      'P&L realizado total y métricas de los trades ejecutados: suma de net_pnl_usd, número de trades, tasa de acierto (%) y cuántos fueron parciales.',
    parameters: { type: 'object', properties: {} },
    async execute(_args, sb) {
      const { data } = await sb.from('trades').select('net_pnl_usd,partial,status').limit(1000);
      const rows = (data ?? []) as { net_pnl_usd: number; partial: boolean }[];
      const total = rows.reduce((s, r) => s + (r.net_pnl_usd ?? 0), 0);
      const wins = rows.filter((r) => (r.net_pnl_usd ?? 0) > 0).length;
      return {
        trades: rows.length,
        net_pnl_usd: round2(total),
        win_rate_pct: rows.length ? round2((wins / rows.length) * 100) : 0,
        parciales: rows.filter((r) => r.partial).length,
      };
    },
  },
  {
    name: 'query_opportunities',
    description:
      'Lista oportunidades recientes con filtros opcionales. Útil para inspeccionar casos concretos (ejecutadas o descartadas).',
    parameters: {
      type: 'object',
      properties: {
        strategy: {
          type: 'string',
          enum: ['spatial', 'cross_quote', 'triangular', 'statistical', 'regional'],
          description: 'filtra por estrategia',
        },
        profitable: { type: 'boolean', description: 'true=solo rentables; false=solo no rentables' },
        executed: { type: 'boolean', description: 'true=solo ejecutadas' },
        skip_reason: { type: 'string', description: 'filtra por motivo de descarte exacto' },
        limit: { type: 'number', description: 'máx filas (1-50, default 20)' },
      },
    },
    async execute(args, sb) {
      let q = sb
        .from('opportunities')
        .select('detected_at,strategy,pair,gross_spread_bps,net_spread_bps,net_usd,profitable,executed,skip_reason')
        .order('detected_at', { ascending: false });
      if (typeof args.strategy === 'string') q = q.eq('strategy', args.strategy);
      if (typeof args.profitable === 'boolean') q = q.eq('profitable', args.profitable);
      if (typeof args.executed === 'boolean') q = q.eq('executed', args.executed);
      if (typeof args.skip_reason === 'string') q = q.eq('skip_reason', args.skip_reason);
      const { data } = await q.limit(clampInt(args.limit, 1, 50, 20));
      return data ?? [];
    },
  },
  {
    name: 'get_rejections',
    description:
      'Histograma de motivos de descarte (skip_reason) sobre las oportunidades recientes — explica por qué el bot NO ejecuta (la narrativa de honestidad).',
    parameters: {
      type: 'object',
      properties: { sample: { type: 'number', description: 'oportunidades recientes a analizar (50-2000, default 500)' } },
    },
    async execute(args, sb) {
      const sample = clampInt(args.sample, 50, 2000, 500);
      const { data } = await sb
        .from('opportunities')
        .select('skip_reason,executed,profitable')
        .order('detected_at', { ascending: false })
        .limit(sample);
      const rows = (data ?? []) as { skip_reason: string | null; executed: boolean; profitable: boolean }[];
      const descartes: Record<string, number> = {};
      let ejecutadas = 0;
      for (const r of rows) {
        if (r.executed) { ejecutadas++; continue; }
        const key = r.skip_reason || (r.profitable ? 'rentable_no_ejecutada' : 'no_rentable');
        descartes[key] = (descartes[key] ?? 0) + 1;
      }
      return { analizadas: rows.length, ejecutadas, descartes };
    },
  },
  {
    name: 'get_strategy_stats',
    description:
      'Métricas por estrategia sobre las oportunidades recientes: detectadas, rentables, ejecutadas y net_spread_bps promedio.',
    parameters: {
      type: 'object',
      properties: { sample: { type: 'number', description: 'oportunidades recientes a analizar (50-2000, default 500)' } },
    },
    async execute(args, sb) {
      const sample = clampInt(args.sample, 50, 2000, 500);
      const { data } = await sb
        .from('opportunities')
        .select('strategy,net_spread_bps,profitable,executed')
        .order('detected_at', { ascending: false })
        .limit(sample);
      const rows = (data ?? []) as { strategy: string; net_spread_bps: number; profitable: boolean; executed: boolean }[];
      const by: Record<string, { n: number; rentables: number; ejecutadas: number; sumNet: number }> = {};
      for (const r of rows) {
        const k = r.strategy || '?';
        const b = by[k] ?? (by[k] = { n: 0, rentables: 0, ejecutadas: 0, sumNet: 0 });
        b.n++;
        if (r.profitable) b.rentables++;
        if (r.executed) b.ejecutadas++;
        b.sumNet += r.net_spread_bps ?? 0;
      }
      return Object.entries(by).map(([strategy, b]) => ({
        strategy,
        oportunidades: b.n,
        rentables: b.rentables,
        ejecutadas: b.ejecutadas,
        net_bps_prom: b.n ? round2(b.sumNet / b.n) : 0,
      }));
    },
  },
  {
    name: 'get_wallets',
    description: 'Saldos de las wallets (simuladas) por exchange y activo — el inventario actual del bot.',
    parameters: { type: 'object', properties: {} },
    async execute(_args, sb) {
      const [wal, ex] = await Promise.all([
        sb.from('wallets').select('exchange_id,asset,balance'),
        sb.from('exchanges').select('id,venue,display_name'),
      ]);
      const venueById = new Map<number, string>(
        ((ex.data ?? []) as { id: number; venue: string; display_name: string }[]).map((e) => [e.id, e.display_name || e.venue]),
      );
      return ((wal.data ?? []) as { exchange_id: number; asset: string; balance: number }[]).map((w) => ({
        venue: venueById.get(w.exchange_id) ?? String(w.exchange_id),
        asset: w.asset,
        balance: w.balance,
      }));
    },
  },
  {
    name: 'get_config',
    description:
      'Parámetros operativos EN VIVO: estado del bot (trading on/off, modo DEMO/Real, umbral neto en bps) + runtime_config + estrategias activas con sus umbrales.',
    parameters: { type: 'object', properties: {} },
    async execute(_args, sb) {
      const bot = await sb.from('bot_state').select('*').eq('id', true).single();
      const sc = await sb.from('strategy_config').select('*');
      let runtime: unknown = null;
      try {
        const rc = await sb.from('runtime_config').select('*').eq('id', true).single();
        runtime = rc.data;
      } catch {
        /* tabla ausente en entornos viejos: degradar */
      }
      return { bot_state: bot.data, runtime_config: runtime, strategies: sc.data ?? [] };
    },
  },
  {
    name: 'get_recent_trades',
    description: 'Últimos trades ejecutados con su VWAP de compra/venta y P&L neto.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: '1-50, default 15' } },
    },
    async execute(args, sb) {
      const { data } = await sb
        .from('trades')
        .select('executed_at,pair,base_volume,vwap_buy,vwap_sell,net_pnl_usd,partial,status')
        .order('executed_at', { ascending: false })
        .limit(clampInt(args.limit, 1, 50, 15));
      return data ?? [];
    },
  },
  {
    name: 'get_news',
    description: 'Señales de noticias recientes con su sentimiento e impacto en el régimen de riesgo (risk-off).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: '1-20, default 10' } },
    },
    async execute(args, sb) {
      const { data } = await sb
        .from('news_signals')
        .select('ts,source,headline,sentiment,impact')
        .order('ts', { ascending: false })
        .limit(clampInt(args.limit, 1, 20, 10));
      return data ?? [];
    },
  },
];

/** Esquemas neutrales (name/description/parameters) — lib/llm.ts los mapea al formato de cada proveedor. */
export function toolSchemas(): { name: string; description: string; parameters: object }[] {
  return COPILOT_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

/** Ejecuta una tool por nombre. Whitelist estricta (seguridad): nombre desconocido → error, nunca SQL libre. */
export async function runCopilotTool(name: string, args: Record<string, unknown> | undefined, sb: ReadSb): Promise<unknown> {
  const tool = COPILOT_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`tool no permitido: ${name}`);
  return tool.execute(args ?? {}, sb);
}
