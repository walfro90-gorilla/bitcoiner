// lib/supabase/types.ts — Tipos de filas de la DB (para queries tipadas en la web).
// NOTA: Postgres `numeric` se serializa como string vía PostgREST; coerce con Number() en UI.
import type { FillLeg, StrategyType } from '@/lib/core/types';

export interface ExchangeRow {
  id: number;
  venue: string;
  display_name: string;
  enabled: boolean;
}

export interface FeeConfigRow {
  id: number;
  exchange_id: number;
  taker_bps: number;
  maker_bps: number;
  withdrawal_btc: number;
  updated_at: string;
}

export interface WalletRow {
  id: number;
  exchange_id: number;
  asset: string;
  balance: number;
  updated_at: string;
}

export interface OpportunityRow {
  id: number;
  detected_at: string;
  strategy: StrategyType;
  buy_exchange_id: number | null;
  sell_exchange_id: number | null;
  pair: string;
  gross_spread_bps: number;
  net_spread_bps: number;
  gross_usd: number;
  net_usd: number;
  max_exec_base: number;
  profitable: boolean;
  executed: boolean;
  skip_reason: string | null;
  feed_lag_ms: number | null;
  detection_latency_ms: number | null;
}

export interface TradeRow {
  id: number;
  opportunity_id: number;
  executed_at: string;
  pair: string;
  base_volume: number;
  vwap_buy: number;
  vwap_sell: number;
  buy_fee_usd: number;
  sell_fee_usd: number;
  withdrawal_fee_usd: number;
  net_pnl_usd: number;
  execution_time_ms: number;
  partial: boolean;
  status: 'filled' | 'partial' | 'rejected';
  legs: FillLeg[];
}

export interface SpreadHistoryRow {
  id: number;
  ts: string;
  pair_a: string;
  pair_b: string;
  mid_a: number;
  mid_b: number;
  spread: number;
  zscore: number | null;
  mean: number | null;
  stddev: number | null;
}

export interface BotStateRow {
  id: boolean;
  trading_enabled: boolean;
  demo_mode: boolean;
  min_net_bps: number;
  max_position_usd: number;
  cumulative_pnl_usd: number;
  consecutive_losses: number;
  updated_at: string;
}
