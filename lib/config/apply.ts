// lib/config/apply.ts — Patch validado de UN campo de configuración (whitelist tipado + audit log).
// Compartido por /api/config (panel) y el copiloto (tool set_config): MISMAS guardas, mismo audit.
// Extraído tal cual del handler POST de app/api/config/route.ts — comportamiento idéntico.
import type { createAdminClient } from '../supabase/admin';

export type FieldType = 'number' | 'boolean' | 'number_or_null';
export type Val = number | boolean | null;
export type ConfigSb = ReturnType<typeof createAdminClient>;

// Whitelist de campos editables por scope (seguridad: solo estas columnas se pueden tocar).
const RUNTIME_FIELDS: Record<string, FieldType> = {
  slippage_bps: 'number', dynamic_slippage: 'boolean', depeg_bps: 'number', withdrawal_amortize_trades: 'number',
  fx_spread_bps: 'number', fx_amortize_trades: 'number', fx_max_age_ms: 'number',
  bitso_mxn_fee_bps: 'number', bitso_mxn_maker_fee_bps: 'number', max_btc_per_trade: 'number',
  max_trades_per_min: 'number', consecutive_loss_halt: 'number', loss_cooldown_ms: 'number',
  stale_ms: 'number', maker_mode: 'boolean', regional_maker_mode: 'boolean', news_poll_ms: 'number',
  rebalance_auto: 'boolean', rebalance_min_operating_usd: 'number', rebalance_runway_trades: 'number',
  rebalance_min_transfer_usd: 'number', rebalance_max_transfer_usd: 'number',
  abort_min_net_bps: 'number', abort_extra_slippage_bps: 'number',
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
export const STRATEGIES = ['spatial', 'cross_quote', 'triangular', 'statistical', 'regional'];

export const SCHEMAS: Record<string, Record<string, FieldType>> = {
  runtime: RUNTIME_FIELDS, strategy: STRATEGY_FIELDS, fee: FEE_FIELDS, exchange: EXCHANGE_FIELDS, bot_state: BOT_STATE_FIELDS,
};

export function validate(type: FieldType, v: unknown): { ok: boolean; value?: Val } {
  if (type === 'boolean') return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false };
  if (type === 'number_or_null') {
    if (v === null) return { ok: true, value: null };
    return typeof v === 'number' && Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
  }
  return typeof v === 'number' && Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
}

/** Resuelve venue -> exchange_id (para fees por exchange). */
async function venueToId(sb: ConfigSb, venue: string): Promise<number | null> {
  const { data } = await sb.from('exchanges').select('id').eq('venue', venue).single();
  return (data as { id: number } | null)?.id ?? null;
}

export async function writeAudit(sb: ConfigSb, scope: string, field: string, oldVal: unknown, newVal: Val): Promise<void> {
  await sb.from('config_audit').insert({ scope, field, old_value: oldVal ?? null, new_value: newVal });
}

export type ApplyResult =
  | { ok: true; old: unknown; new: Val }
  | { ok: false; status: number; error: string };

/**
 * Aplica el cambio de un campo: valida contra el whitelist, actualiza la tabla del scope
 * y registra old→new en config_audit. Nunca lanza: errores → { ok: false, status, error }.
 */
export async function applyFieldChange(
  sb: ConfigSb,
  { scope, field, value: raw, key }: { scope: string; field: string; value: unknown; key?: string },
): Promise<ApplyResult> {
  const schema = SCHEMAS[scope];
  if (!schema || !(field in schema)) return { ok: false, status: 400, error: `campo inválido: ${scope}.${field}` };
  const v = validate(schema[field], raw);
  if (!v.ok) return { ok: false, status: 400, error: `valor inválido para ${scope}.${field}` };
  const value = v.value as Val;
  const now = new Date().toISOString();

  try {
    let oldVal: unknown;
    if (scope === 'runtime') {
      const { data: old } = await sb.from('runtime_config').select(field).eq('id', true).single();
      const { error } = await sb.from('runtime_config').update({ [field]: value, updated_at: now }).eq('id', true);
      if (error) throw error;
      oldVal = (old as Record<string, unknown> | null)?.[field];
      await writeAudit(sb, 'runtime', field, oldVal, value);
    } else if (scope === 'bot_state') {
      const { data: old } = await sb.from('bot_state').select(field).eq('id', true).single();
      const { error } = await sb.from('bot_state').update({ [field]: value, updated_at: now }).eq('id', true);
      if (error) throw error;
      oldVal = (old as Record<string, unknown> | null)?.[field];
      await writeAudit(sb, 'bot_state', field, oldVal, value);
    } else if (scope === 'strategy') {
      if (!key || !STRATEGIES.includes(key)) return { ok: false, status: 400, error: 'estrategia inválida' };
      const { data: old } = await sb.from('strategy_config').select(field).eq('strategy', key).single();
      const { error } = await sb.from('strategy_config').update({ [field]: value, updated_at: now }).eq('strategy', key);
      if (error) throw error;
      oldVal = (old as Record<string, unknown> | null)?.[field];
      await writeAudit(sb, 'strategy', `${key}.${field}`, oldVal, value);
    } else if (scope === 'exchange') {
      if (!key) return { ok: false, status: 400, error: 'venue requerido' };
      const { data: old } = await sb.from('exchanges').select(field).eq('venue', key).single();
      const { error } = await sb.from('exchanges').update({ [field]: value }).eq('venue', key);
      if (error) throw error;
      oldVal = (old as Record<string, unknown> | null)?.[field];
      await writeAudit(sb, 'exchange', `${key}.${field}`, oldVal, value);
    } else if (scope === 'fee') {
      if (!key) return { ok: false, status: 400, error: 'venue requerido' };
      const exId = await venueToId(sb, key);
      if (exId == null) return { ok: false, status: 404, error: 'venue no encontrado' };
      const { data: old } = await sb.from('fee_config').select(field).eq('exchange_id', exId).single();
      const { error } = await sb.from('fee_config').update({ [field]: value, updated_at: now }).eq('exchange_id', exId);
      if (error) throw error;
      oldVal = (old as Record<string, unknown> | null)?.[field];
      await writeAudit(sb, 'fee', `${key}.${field}`, oldVal, value);
    }
    return { ok: true, old: oldVal, new: value };
  } catch (e) {
    return { ok: false, status: 500, error: (e as Error).message };
  }
}
