// app/api/config/route.ts — Parametrización TOTAL en vivo (diferenciador #1).
// GET: snapshot completo de configuración. POST: patch validado por scope/field con audit log,
// o aplicar/guardar perfiles. Escribe vía service-role; el worker adopta los cambios en ≤2.5s.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type FieldType = 'number' | 'boolean' | 'number_or_null';
type Val = number | boolean | null;

// Whitelist de campos editables por scope (seguridad: solo estas columnas se pueden tocar).
const RUNTIME_FIELDS: Record<string, FieldType> = {
  slippage_bps: 'number', dynamic_slippage: 'boolean', depeg_bps: 'number', withdrawal_amortize_trades: 'number',
  fx_spread_bps: 'number', fx_amortize_trades: 'number', fx_max_age_ms: 'number',
  bitso_mxn_fee_bps: 'number', bitso_mxn_maker_fee_bps: 'number', max_btc_per_trade: 'number',
  max_trades_per_min: 'number', consecutive_loss_halt: 'number', loss_cooldown_ms: 'number',
  stale_ms: 'number', maker_mode: 'boolean', regional_maker_mode: 'boolean', news_poll_ms: 'number',
  rebalance_auto: 'boolean', rebalance_min_operating_usd: 'number', rebalance_runway_trades: 'number',
  rebalance_min_transfer_usd: 'number', rebalance_max_transfer_usd: 'number',
};
const STRATEGY_FIELDS: Record<string, FieldType> = {
  enabled: 'boolean', min_net_bps_override: 'number_or_null', maker: 'boolean',
  target_base: 'number_or_null', notional_usd: 'number_or_null',
  stat_entry: 'number_or_null', stat_exit: 'number_or_null', stat_stop: 'number_or_null',
};
const FEE_FIELDS: Record<string, FieldType> = { taker_bps: 'number', maker_bps: 'number', withdrawal_btc: 'number' };
const EXCHANGE_FIELDS: Record<string, FieldType> = { enabled: 'boolean' };
const BOT_STATE_FIELDS: Record<string, FieldType> = {
  trading_enabled: 'boolean', demo_mode: 'boolean', min_net_bps: 'number', max_position_usd: 'number',
};
const STRATEGIES = ['spatial', 'cross_quote', 'triangular', 'statistical', 'regional'];

function validate(type: FieldType, v: unknown): { ok: boolean; value?: Val } {
  if (type === 'boolean') return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false };
  if (type === 'number_or_null') {
    if (v === null) return { ok: true, value: null };
    return typeof v === 'number' && Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
  }
  return typeof v === 'number' && Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
}

export async function GET() {
  const sb = createAdminClient();
  const [rc, sc, ex, fees, profiles, audit, bs] = await Promise.all([
    sb.from('runtime_config').select('*').eq('id', true).single(),
    sb.from('strategy_config').select('*').order('strategy'),
    sb.from('exchanges').select('*').order('id'),
    sb.from('fee_config').select('*').order('exchange_id'),
    sb.from('config_profiles').select('*').order('id'),
    sb.from('config_audit').select('*').order('ts', { ascending: false }).limit(50),
    sb.from('bot_state').select('*').eq('id', true).single(),
  ]);
  return NextResponse.json({
    runtime_config: rc.data ?? null,
    strategy_config: sc.data ?? [],
    exchanges: ex.data ?? [],
    fee_config: fees.data ?? [],
    profiles: profiles.data ?? [],
    audit: audit.data ?? [],
    bot_state: bs.data ?? null,
  });
}

type Sb = ReturnType<typeof createAdminClient>;

/** Resuelve venue -> exchange_id (para fees por exchange). */
async function venueToId(sb: Sb, venue: string): Promise<number | null> {
  const { data } = await sb.from('exchanges').select('id').eq('venue', venue).single();
  return (data as { id: number } | null)?.id ?? null;
}

async function writeAudit(sb: Sb, scope: string, field: string, oldVal: unknown, newVal: Val): Promise<void> {
  await sb.from('config_audit').insert({ scope, field, old_value: oldVal ?? null, new_value: newVal });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = createAdminClient();

  // ── Perfiles ──
  if (body.action === 'save_profile') {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 });
    const [rc, sc, ex, fees] = await Promise.all([
      sb.from('runtime_config').select('*').eq('id', true).single(),
      sb.from('strategy_config').select('*'),
      sb.from('exchanges').select('venue, enabled'),
      sb.from('fee_config').select('*'),
    ]);
    const { data: bs } = await sb.from('bot_state').select('min_net_bps, demo_mode, max_position_usd').eq('id', true).single();
    const snapshot = { bot_state: bs, runtime_config: rc.data, strategy_config: sc.data, exchanges: ex.data, fee_config: fees.data };
    const { error } = await sb
      .from('config_profiles')
      .upsert({ name, description: String(body.description ?? ''), snapshot, is_builtin: false }, { onConflict: 'name' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(sb, 'profile', `save:${name}`, null, null);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'apply_profile') {
    const name = String(body.name ?? '');
    const { data: prof } = await sb.from('config_profiles').select('snapshot').eq('name', name).single();
    const snap = (prof as { snapshot?: Record<string, unknown> } | null)?.snapshot;
    if (!snap) return NextResponse.json({ error: 'perfil no encontrado' }, { status: 404 });
    const now = new Date().toISOString();
    if (snap.bot_state && typeof snap.bot_state === 'object')
      await sb.from('bot_state').update({ ...(snap.bot_state as object), updated_at: now }).eq('id', true);
    if (snap.runtime_config && typeof snap.runtime_config === 'object') {
      const { id: _id, updated_at: _u, ...rcFields } = snap.runtime_config as Record<string, unknown>;
      void _id; void _u;
      await sb.from('runtime_config').update({ ...rcFields, updated_at: now }).eq('id', true);
    }
    for (const row of (Array.isArray(snap.strategy_config) ? snap.strategy_config : []) as Array<Record<string, unknown>>) {
      const { strategy, updated_at: _su, ...stFields } = row;
      void _su;
      if (strategy) await sb.from('strategy_config').update({ ...stFields, updated_at: now }).eq('strategy', strategy);
    }
    await writeAudit(sb, 'profile', `apply:${name}`, null, null);
    return NextResponse.json({ ok: true });
  }

  // ── Patch de un campo ──
  const scope = String(body.scope ?? '');
  const field = String(body.field ?? '');
  const key = body.key != null ? String(body.key) : undefined;
  const raw = body.value;

  const SCHEMAS: Record<string, Record<string, FieldType>> = {
    runtime: RUNTIME_FIELDS, strategy: STRATEGY_FIELDS, fee: FEE_FIELDS, exchange: EXCHANGE_FIELDS, bot_state: BOT_STATE_FIELDS,
  };
  const schema = SCHEMAS[scope];
  if (!schema || !(field in schema)) return NextResponse.json({ error: `campo inválido: ${scope}.${field}` }, { status: 400 });
  const v = validate(schema[field], raw);
  if (!v.ok) return NextResponse.json({ error: `valor inválido para ${scope}.${field}` }, { status: 400 });
  const value = v.value as Val;
  const now = new Date().toISOString();

  try {
    if (scope === 'runtime') {
      const { data: old } = await sb.from('runtime_config').select(field).eq('id', true).single();
      const { error } = await sb.from('runtime_config').update({ [field]: value, updated_at: now }).eq('id', true);
      if (error) throw error;
      await writeAudit(sb, 'runtime', field, (old as Record<string, unknown> | null)?.[field], value);
    } else if (scope === 'bot_state') {
      const { data: old } = await sb.from('bot_state').select(field).eq('id', true).single();
      const { error } = await sb.from('bot_state').update({ [field]: value, updated_at: now }).eq('id', true);
      if (error) throw error;
      await writeAudit(sb, 'bot_state', field, (old as Record<string, unknown> | null)?.[field], value);
    } else if (scope === 'strategy') {
      if (!key || !STRATEGIES.includes(key)) return NextResponse.json({ error: 'estrategia inválida' }, { status: 400 });
      const { data: old } = await sb.from('strategy_config').select(field).eq('strategy', key).single();
      const { error } = await sb.from('strategy_config').update({ [field]: value, updated_at: now }).eq('strategy', key);
      if (error) throw error;
      await writeAudit(sb, 'strategy', `${key}.${field}`, (old as Record<string, unknown> | null)?.[field], value);
    } else if (scope === 'exchange') {
      if (!key) return NextResponse.json({ error: 'venue requerido' }, { status: 400 });
      const { data: old } = await sb.from('exchanges').select(field).eq('venue', key).single();
      const { error } = await sb.from('exchanges').update({ [field]: value }).eq('venue', key);
      if (error) throw error;
      await writeAudit(sb, 'exchange', `${key}.${field}`, (old as Record<string, unknown> | null)?.[field], value);
    } else if (scope === 'fee') {
      if (!key) return NextResponse.json({ error: 'venue requerido' }, { status: 400 });
      const exId = await venueToId(sb, key);
      if (exId == null) return NextResponse.json({ error: 'venue no encontrado' }, { status: 404 });
      const { data: old } = await sb.from('fee_config').select(field).eq('exchange_id', exId).single();
      const { error } = await sb.from('fee_config').update({ [field]: value, updated_at: now }).eq('exchange_id', exId);
      if (error) throw error;
      await writeAudit(sb, 'fee', `${key}.${field}`, (old as Record<string, unknown> | null)?.[field], value);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
