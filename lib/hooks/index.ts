'use client';
// lib/hooks/index.ts — Hooks de datos (SWR + Realtime singleton).
import { useEffect } from 'react';
import useSWR from 'swr';
import { getSupabaseBrowser } from '../supabase/client';
import { subscribeTable } from '../realtime';
import type {
  BotStateRow,
  ExchangeRow,
  MarketTickRow,
  NewsSignalRow,
  OpportunityRow,
  TradeRow,
  WalletRow,
} from '../supabase/types';

const sb = () => getSupabaseBrowser();

/** Mapa id->exchange (carga única, sin realtime). */
export function useExchanges() {
  const { data } = useSWR('exchanges', async () => {
    const { data } = await sb().from('exchanges').select('*').order('id');
    return (data ?? []) as ExchangeRow[];
  });
  const byId = new Map<number, ExchangeRow>((data ?? []).map((e) => [e.id, e]));
  const name = (id: number | null) => (id != null ? byId.get(id)?.display_name ?? '—' : '—');
  return { exchanges: data ?? [], byId, name };
}

export function useOpportunities(limit = 60) {
  const { data, mutate, isLoading } = useSWR(
    ['opportunities', limit],
    async () => {
      const { data } = await sb()
        .from('opportunities')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(limit);
      return (data ?? []) as OpportunityRow[];
    },
    { refreshInterval: 5000 }, // opportunities ya no está en realtime → polling frecuente
  );
  useEffect(() => subscribeTable('opportunities', () => void mutate()), [mutate]);
  return { opportunities: data ?? [], isLoading };
}

export function useTrades(limit = 40) {
  const { data, mutate, isLoading } = useSWR(
    ['trades', limit],
    async () => {
      const { data } = await sb()
        .from('trades')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(limit);
      return (data ?? []) as TradeRow[];
    },
    { refreshInterval: 5000 },
  );
  useEffect(() => subscribeTable('trades', () => void mutate()), [mutate]);
  return { trades: data ?? [], isLoading };
}

/** Serie temporal de P&L acumulado a partir de los trades (orden ascendente). */
export function usePnlSeries(limit = 500) {
  const { data, mutate } = useSWR(
    ['pnl-series', limit],
    async () => {
      const { data } = await sb()
        .from('trades')
        .select('executed_at, net_pnl_usd')
        .order('executed_at', { ascending: true })
        .limit(limit);
      let cum = 0;
      return (data ?? []).map((t) => {
        cum += Number(t.net_pnl_usd);
        return { t: t.executed_at as string, pnl: Number(t.net_pnl_usd), cum };
      });
    },
    { refreshInterval: 5000 },
  );
  useEffect(() => subscribeTable('trades', () => void mutate()), [mutate]);
  return data ?? [];
}

export function useWallets() {
  const { data, mutate } = useSWR(
    'wallets',
    async () => {
      const { data } = await sb().from('wallets').select('*').order('exchange_id');
      return (data ?? []) as WalletRow[];
    },
    { refreshInterval: 60_000 },
  );
  useEffect(() => subscribeTable('wallets', () => void mutate()), [mutate]);
  return data ?? [];
}

export function useBotState() {
  const { data, mutate } = useSWR(
    'bot_state',
    async () => {
      const { data } = await sb().from('bot_state').select('*').eq('id', true).single();
      return (data as BotStateRow) ?? null;
    },
    { refreshInterval: 4000 }, // P&L acumulado / estado: refresco frecuente (no depende solo de realtime)
  );
  useEffect(() => subscribeTable('bot_state', () => void mutate()), [mutate]);
  return { botState: data ?? null, mutate };
}

export function useCounts() {
  const { data, mutate } = useSWR(
    'counts',
    async () => {
      const c = sb();
      const [opp, trd] = await Promise.all([
        c.from('opportunities').select('*', { count: 'estimated', head: true }),
        c.from('trades').select('*', { count: 'exact', head: true }),
      ]);
      const trades = trd.count ?? 0;
      return { opportunities: opp.count ?? 0, trades, executed: trades };
    },
    { refreshInterval: 5000 },
  );
  useEffect(() => {
    const a = subscribeTable('trades', () => void mutate());
    const b = subscribeTable('opportunities', () => void mutate());
    return () => {
      a();
      b();
    };
  }, [mutate]);
  return data ?? { opportunities: 0, trades: 0, executed: 0 };
}

export function useSpreadHistory(pairA: string, pairB: string, limit = 240) {
  const { data } = useSWR(
    ['spread', pairA, pairB, limit],
    async () => {
      const { data } = await sb()
        .from('spread_history')
        .select('ts, spread, zscore, mean, stddev')
        .eq('pair_a', pairA)
        .eq('pair_b', pairB)
        .order('ts', { ascending: false })
        .limit(limit);
      return ((data ?? []) as Array<{ ts: string; spread: number; zscore: number | null }>).reverse();
    },
    { refreshInterval: 5000 },
  );
  return data ?? [];
}

/** Serie larga de premio Bitso (bps) para backtest histórico. */
export function usePremiumSeries(limit = 2000) {
  const { data } = useSWR(
    ['premium-series', limit],
    async () => {
      const { data } = await sb()
        .from('spread_history')
        .select('ts, spread')
        .eq('pair_a', 'Bitso BTC/MXN (USD)')
        .eq('pair_b', 'Global BTC/USDT')
        .order('ts', { ascending: false })
        .limit(limit);
      return ((data ?? []) as Array<{ ts: string; spread: number }>)
        .map((d) => ({ ts: d.ts, premiumBps: Number(d.spread) }))
        .reverse();
    },
    { refreshInterval: 30_000 },
  );
  return data ?? [];
}

export function useNews(limit = 12) {
  const { data, mutate } = useSWR(
    ['news', limit],
    async () => {
      const { data } = await sb().from('news_signals').select('*').order('ts', { ascending: false }).limit(limit);
      return (data ?? []) as NewsSignalRow[];
    },
    { refreshInterval: 60_000 },
  );
  useEffect(() => subscribeTable('news_signals', () => void mutate()), [mutate]);
  return data ?? [];
}

/** Estado de mercado en vivo (BBO por venue+pair). Polling cada 2s (tabla acotada). */
export function useMarketTicks() {
  const { data } = useSWR(
    'market_ticks',
    async () => {
      const { data } = await sb().from('market_ticks').select('*');
      return (data ?? []) as MarketTickRow[];
    },
    { refreshInterval: 2000 },
  );
  return data ?? [];
}

/** Latencias crudas de las últimas N oportunidades (para percentiles en la UI). */
export function useLatencyStats(limit = 200) {
  const { data, mutate } = useSWR(
    ['latency', limit],
    async () => {
      const { data } = await sb()
        .from('opportunities')
        .select('detection_latency_ms, feed_lag_ms')
        .order('detected_at', { ascending: false })
        .limit(limit);
      return (data ?? []) as Array<{ detection_latency_ms: number | null; feed_lag_ms: number | null }>;
    },
    { refreshInterval: 10_000 },
  );
  useEffect(() => subscribeTable('opportunities', () => void mutate()), [mutate]);
  return data ?? [];
}

export interface StrategyStat {
  trades: number;
  wins: number;
  pnl: number;
}
type TradeStratRow = {
  net_pnl_usd: number | string;
  opportunities: { strategy: string } | { strategy: string }[] | null;
};

/** Agrega P&L / win-rate por estrategia (join trades -> opportunities.strategy). */
export function useStrategyStats() {
  const { data, mutate } = useSWR(
    'strategy-stats',
    async () => {
      const { data } = await sb()
        .from('trades')
        .select('net_pnl_usd, opportunities(strategy)')
        .order('executed_at', { ascending: false })
        .limit(1000);
      const acc: Record<string, StrategyStat> = {};
      for (const row of (data ?? []) as TradeStratRow[]) {
        const opp = Array.isArray(row.opportunities) ? row.opportunities[0] : row.opportunities;
        const strat = opp?.strategy ?? 'spatial';
        const pnl = Number(row.net_pnl_usd) || 0;
        const s = (acc[strat] ??= { trades: 0, wins: 0, pnl: 0 });
        s.trades++;
        s.pnl += pnl;
        if (pnl > 0) s.wins++;
      }
      return acc;
    },
    { refreshInterval: 30_000 },
  );
  useEffect(() => subscribeTable('trades', () => void mutate()), [mutate]);
  return data ?? ({} as Record<string, StrategyStat>);
}

export interface RejectionStats {
  total: number;
  profitable: number;
  executed: number;
  byReason: Record<string, number>;
  nearMisses: Array<{ strategy: string; net_spread_bps: number; gross_spread_bps: number }>;
}
type OppRejRow = {
  strategy: string;
  skip_reason: string | null;
  profitable: boolean;
  executed: boolean;
  net_spread_bps: number | string;
  gross_spread_bps: number | string;
};

/** Análisis de descartes: por qué el bot NO ejecuta (skip_reason) + las "casi-rentables". */
export function useRejectionStats(limit = 500) {
  const { data, mutate } = useSWR(
    ['rejection', limit],
    async () => {
      const { data } = await sb()
        .from('opportunities')
        .select('strategy, skip_reason, profitable, executed, net_spread_bps, gross_spread_bps')
        .order('detected_at', { ascending: false })
        .limit(limit);
      const rows = (data ?? []) as OppRejRow[];
      const byReason: Record<string, number> = {};
      let profitable = 0;
      let executed = 0;
      for (const r of rows) {
        if (r.executed) executed++;
        const key = r.executed ? 'ejecutada' : r.skip_reason ?? 'vista';
        byReason[key] = (byReason[key] ?? 0) + 1;
        if (r.profitable) profitable++;
      }
      const nearMisses = rows
        .filter((r) => !r.profitable && !r.executed)
        .map((r) => ({
          strategy: r.strategy,
          net_spread_bps: Number(r.net_spread_bps),
          gross_spread_bps: Number(r.gross_spread_bps),
        }))
        .sort((a, b) => b.net_spread_bps - a.net_spread_bps)
        .slice(0, 5);
      return { total: rows.length, profitable, executed, byReason, nearMisses };
    },
    { refreshInterval: 15_000 },
  );
  useEffect(() => subscribeTable('opportunities', () => void mutate()), [mutate]);
  return data ?? { total: 0, profitable: 0, executed: 0, byReason: {}, nearMisses: [] };
}
