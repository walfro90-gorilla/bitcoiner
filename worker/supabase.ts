// worker/supabase.ts — Cliente service-role del worker + carga de config (fees, wallets, bot_state).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { CONFIG, HAS_SUPABASE } from './config';
import { DEFAULT_FEES, type FeeTable, type Venue } from './core';
import { Ledger } from './state';

export const supabase: SupabaseClient | null = HAS_SUPABASE
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Node < 22 no trae WebSocket nativo: proveer transport ws para Realtime.
      realtime: { transport: WebSocket as unknown as never },
    })
  : null;

export interface BotStateRow {
  trading_enabled: boolean;
  demo_mode: boolean;
  min_net_bps: number;
  max_position_usd: number;
  cumulative_pnl_usd: number;
  consecutive_losses: number;
  inject_seq: number;
}

export async function loadExchanges(): Promise<Map<Venue, number>> {
  const map = new Map<Venue, number>();
  if (!supabase) return map;
  const { data, error } = await supabase.from('exchanges').select('id, venue');
  if (error) console.error('[db] loadExchanges:', error.message);
  for (const r of data ?? []) map.set(r.venue as Venue, r.id as number);
  return map;
}

function invert(exMap: Map<Venue, number>): Map<number, Venue> {
  const m = new Map<number, Venue>();
  for (const [v, id] of exMap) m.set(id, v);
  return m;
}

export async function loadFees(exMap: Map<Venue, number>): Promise<FeeTable> {
  const fees: FeeTable = { ...DEFAULT_FEES };
  if (!supabase) return fees;
  const idToVenue = invert(exMap);
  const { data, error } = await supabase
    .from('fee_config')
    .select('exchange_id, taker_bps, maker_bps, withdrawal_btc');
  if (error) console.error('[db] loadFees:', error.message);
  for (const r of data ?? []) {
    const v = idToVenue.get(r.exchange_id as number);
    if (v) fees[v] = { takerBps: +r.taker_bps, makerBps: +r.maker_bps, withdrawalBtc: +r.withdrawal_btc };
  }
  return fees;
}

export async function loadWallets(exMap: Map<Venue, number>, ledger: Ledger): Promise<void> {
  if (!supabase) return;
  const idToVenue = invert(exMap);
  const { data, error } = await supabase.from('wallets').select('exchange_id, asset, balance');
  if (error) console.error('[db] loadWallets:', error.message);
  for (const r of data ?? []) {
    const v = idToVenue.get(r.exchange_id as number);
    if (v) ledger.set(v, r.asset, +r.balance);
  }
}

export async function loadBotState(): Promise<BotStateRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('bot_state')
    .select('trading_enabled, demo_mode, min_net_bps, max_position_usd, cumulative_pnl_usd, consecutive_losses, inject_seq')
    .eq('id', true)
    .single();
  if (error) console.error('[db] loadBotState:', error.message);
  return (data as BotStateRow) ?? null;
}
