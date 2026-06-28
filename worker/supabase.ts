// worker/supabase.ts — Cliente service-role del worker + carga de config (fees, wallets, bot_state).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { CONFIG, HAS_SUPABASE } from './config';
import { DEFAULT_FEES, type FeeTable, type StrategyType, type Venue } from './core';
import { Ledger } from './state';
import type { RuntimeConfig, StrategyConfig } from './runtimeConfig';

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

/** Parametrización TOTAL (0012): estado de habilitado por exchange, leído en vivo. */
export async function loadExchangeEnabled(): Promise<Map<Venue, boolean>> {
  const map = new Map<Venue, boolean>();
  if (!supabase) return map;
  const { data, error } = await supabase.from('exchanges').select('venue, enabled');
  if (error) console.error('[db] loadExchangeEnabled:', error.message);
  for (const r of data ?? []) map.set(r.venue as Venue, r.enabled as boolean);
  return map;
}

/** Config global en caliente desde runtime_config (singleton). camelCase + coerción numeric→Number. */
export async function loadRuntimeConfig(): Promise<Partial<RuntimeConfig> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('runtime_config').select('*').eq('id', true).single();
  if (error) {
    console.error('[db] loadRuntimeConfig:', error.message);
    return null;
  }
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    slippageBps: +(d.slippage_bps as number),
    dynamicSlippage: !!d.dynamic_slippage,
    depegBps: +(d.depeg_bps as number),
    withdrawalAmortizeTrades: +(d.withdrawal_amortize_trades as number),
    fxSpreadBps: +(d.fx_spread_bps as number),
    fxAmortizeTrades: +(d.fx_amortize_trades as number),
    fxMaxAgeMs: +(d.fx_max_age_ms as number),
    bitsoMxnFeeBps: +(d.bitso_mxn_fee_bps as number),
    bitsoMxnMakerFeeBps: +(d.bitso_mxn_maker_fee_bps as number),
    maxBtcPerTrade: +(d.max_btc_per_trade as number),
    maxTradesPerMin: +(d.max_trades_per_min as number),
    consecutiveLossHalt: +(d.consecutive_loss_halt as number),
    lossCooldownMs: +(d.loss_cooldown_ms as number),
    staleMs: +(d.stale_ms as number),
    newsPollMs: +(d.news_poll_ms as number),
    rebalanceAuto: !!d.rebalance_auto,
    rebalanceMinOperatingUsd: +(d.rebalance_min_operating_usd as number),
    rebalanceRunwayTrades: +(d.rebalance_runway_trades as number),
    rebalanceMinTransferUsd: +(d.rebalance_min_transfer_usd as number),
    rebalanceMaxTransferUsd: +(d.rebalance_max_transfer_usd as number),
    abortMinNetBps: +(d.abort_min_net_bps as number),
    abortExtraSlippageBps: +(d.abort_extra_slippage_bps as number),
  };
}

/** Config por estrategia desde strategy_config. Devuelve patches camelCase por estrategia. */
export async function loadStrategyConfig(): Promise<Array<{ strategy: StrategyType; patch: Partial<StrategyConfig> }>> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('strategy_config').select('*');
  if (error) {
    console.error('[db] loadStrategyConfig:', error.message);
    return [];
  }
  const num = (v: unknown): number | null => (v == null ? null : +(v as number));
  return (data ?? []).map((r) => {
    const d = r as Record<string, unknown>;
    return {
      strategy: d.strategy as StrategyType,
      patch: {
        enabled: !!d.enabled,
        minNetBpsOverride: num(d.min_net_bps_override),
        maker: !!d.maker,
        targetBase: num(d.target_base),
        notionalUsd: num(d.notional_usd),
        statEntry: num(d.stat_entry),
        statExit: num(d.stat_exit),
        statStop: num(d.stat_stop),
      },
    };
  });
}
