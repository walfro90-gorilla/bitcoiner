'use client';
// lib/hooks/index.ts — Hooks de datos (SWR + Realtime singleton).
import { useEffect } from 'react';
import useSWR from 'swr';
import { getSupabaseBrowser } from '../supabase/client';
import { subscribeTable } from '../realtime';
import type {
  BotStateRow,
  ExchangeRow,
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
    { refreshInterval: 60_000 },
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
    { refreshInterval: 60_000 },
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
    { refreshInterval: 60_000 },
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
    { refreshInterval: 30_000 },
  );
  useEffect(() => subscribeTable('bot_state', () => void mutate()), [mutate]);
  return { botState: data ?? null, mutate };
}

export function useCounts() {
  const { data, mutate } = useSWR(
    'counts',
    async () => {
      const c = sb();
      const [opp, trd, exe] = await Promise.all([
        c.from('opportunities').select('*', { count: 'exact', head: true }),
        c.from('trades').select('*', { count: 'exact', head: true }),
        c.from('opportunities').select('*', { count: 'exact', head: true }).eq('executed', true),
      ]);
      return { opportunities: opp.count ?? 0, trades: trd.count ?? 0, executed: exe.count ?? 0 };
    },
    { refreshInterval: 15_000 },
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
