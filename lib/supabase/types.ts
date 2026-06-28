// lib/supabase/types.ts — Tipos de filas de la DB (para queries tipadas en la web).
// NOTA: Postgres `numeric` se serializa como string vía PostgREST; coerce con Number() en UI.
import type { FillLeg, Level, StrategyType } from '@/lib/core/types';

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
  news_sentiment: number | null;
  news_impact: string | null;
  news_summary: string | null;
  news_updated_at: string | null;
  updated_at: string;
}

export interface NewsSignalRow {
  id: number;
  ts: string;
  source: string | null;
  headline: string;
  url: string | null;
  currencies: string | null;
  sentiment: number | null;
  impact: string | null;
  summary: string | null;
}

/** Estado de mercado en vivo: 1 fila por (exchange_id, pair), upserted por el worker. */
export interface MarketTickRow {
  exchange_id: number;
  pair: string;
  base: string;
  quote: string;
  bid: number;
  ask: number;
  bid_size: number;
  ask_size: number;
  mid: number;
  spread_bps: number;
  bids: Level[];
  asks: Level[];
  exchange_ts: number | null;
  ts: string;
}

// ── Parametrización TOTAL en vivo (migración 0012) ──
export interface RuntimeConfigRow {
  id: boolean;
  slippage_bps: number;
  dynamic_slippage: boolean;
  depeg_bps: number;
  withdrawal_amortize_trades: number;
  fx_spread_bps: number;
  fx_amortize_trades: number;
  fx_max_age_ms: number;
  bitso_mxn_fee_bps: number;
  bitso_mxn_maker_fee_bps: number;
  max_btc_per_trade: number;
  max_trades_per_min: number;
  consecutive_loss_halt: number;
  loss_cooldown_ms: number;
  stale_ms: number;
  maker_mode: boolean;
  regional_maker_mode: boolean;
  news_poll_ms: number;
  rebalance_auto: boolean;
  rebalance_min_operating_usd: number;
  rebalance_runway_trades: number;
  rebalance_min_transfer_usd: number;
  rebalance_max_transfer_usd: number;
  abort_min_net_bps: number;
  abort_extra_slippage_bps: number;
  updated_at: string;
}

export interface StrategyConfigRow {
  strategy: StrategyType;
  enabled: boolean;
  min_net_bps_override: number | null;
  maker: boolean;
  target_base: number | null;
  notional_usd: number | null;
  stat_entry: number | null;
  stat_exit: number | null;
  stat_stop: number | null;
  updated_at: string;
}

export interface ConfigProfileRow {
  id: number;
  name: string;
  description: string | null;
  snapshot: Record<string, unknown>;
  is_builtin: boolean;
  created_at: string;
}

export interface ConfigAuditRow {
  id: number;
  ts: string;
  actor: string;
  scope: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
}

/** Vela OHLC 1m (migración 0013). `t` es timestamptz (inicio del bucket). */
export interface CandleRow {
  id: number;
  pair: string;
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  updated_at: string;
}

/** Transferencia de rebalanceo simulada (migración 0014). */
export interface TransferRow {
  id: number;
  created_at: string;
  from_exchange_id: number | null;
  to_exchange_id: number | null;
  asset: string;
  amount: number;
  amount_usd: number;
  cost_usd: number;
  status: string; // in_transit | completed | cancelled
  reason: string | null;
  eta_ms: number;
  auto: boolean;
  completed_at: string | null;
}
