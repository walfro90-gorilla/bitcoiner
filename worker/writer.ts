// worker/writer.ts — Escritura a Supabase. Cola batched (opps/spread/snapshots) + ejecución inmediata.
import { supabase } from './supabase';
import type { Asset, Venue } from './core';

type Row = Record<string, unknown>;

export interface ExecutionPayload {
  oppRow: Row; // fila de opportunities (executed=true)
  tradeRowBase: Row; // fila de trades SIN opportunity_id
  walletSnapshot: Array<{ venue: Venue; asset: Asset; balance: number }>;
  botState: { cumulativePnlUsd: number; consecutiveLosses: number };
}

export class Writer {
  private oppQueue: Row[] = [];
  private spreadQueue: Row[] = [];
  private snapQueue: Row[] = [];
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly exMap: Map<Venue, number>) {}

  start(): void {
    this.timer = setInterval(() => void this.flush(), 250);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  exId(v: Venue | null): number | null {
    return v ? this.exMap.get(v) ?? null : null;
  }

  queueOpportunity(row: Row): void {
    this.oppQueue.push(row);
    if (this.oppQueue.length >= 100) void this.flush();
  }
  queueSpread(row: Row): void {
    this.spreadQueue.push(row);
  }
  queueSnapshot(row: Row): void {
    this.snapQueue.push(row);
  }

  /** Upsert del estado de mercado en vivo (BBO). Tabla acotada: 1 fila por venue+pair. */
  async upsertMarketTicks(rows: Row[]): Promise<void> {
    if (!supabase || !rows.length) return;
    const { error } = await supabase.from('market_ticks').upsert(rows, { onConflict: 'exchange_id,pair' });
    if (error) console.error('[db] market_ticks upsert:', error.message);
  }

  /** Upsert de la vela OHLC en formación (1 fila por pair+minuto). Para el chart de velas. */
  async upsertCandle(row: Row): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('candles').upsert(row, { onConflict: 'pair,t' });
    if (error) console.error('[db] candles upsert:', error.message);
  }

  /** Inserta una transferencia (rebalanceo) y devuelve su id, o null sin DB/error. */
  async insertTransfer(row: Row): Promise<number | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.from('transfers').insert(row).select('id').single();
    if (error) {
      console.error('[db] transfer insert:', error.message);
      return null;
    }
    return (data as { id: number }).id;
  }

  /** Actualiza el estado de una transferencia (in_transit -> completed). */
  async updateTransfer(id: number, patch: Row): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('transfers').update(patch).eq('id', id);
    if (error) console.error('[db] transfer update:', error.message);
  }

  /** Persiste el snapshot de wallets (tras un rebalanceo). */
  async upsertWallets(snapshot: Array<{ venue: Venue; asset: Asset; balance: number }>): Promise<void> {
    if (!supabase) return;
    const now = new Date().toISOString();
    const rows = snapshot
      .map((w) => ({ exchange_id: this.exId(w.venue), asset: w.asset, balance: w.balance, updated_at: now }))
      .filter((r) => r.exchange_id != null);
    if (!rows.length) return;
    const { error } = await supabase.from('wallets').upsert(rows, { onConflict: 'exchange_id,asset' });
    if (error) console.error('[db] wallets upsert (rebal):', error.message);
  }

  private async flush(): Promise<void> {
    if (!supabase) {
      this.oppQueue.length = 0;
      this.spreadQueue.length = 0;
      this.snapQueue.length = 0;
      return;
    }
    if (this.oppQueue.length) {
      const batch = this.oppQueue.splice(0);
      const { error } = await supabase.from('opportunities').insert(batch);
      if (error) console.error('[db] opp batch:', error.message);
    }
    if (this.spreadQueue.length) {
      const batch = this.spreadQueue.splice(0);
      const { error } = await supabase.from('spread_history').insert(batch);
      if (error) console.error('[db] spread batch:', error.message);
    }
    if (this.snapQueue.length) {
      const batch = this.snapQueue.splice(0);
      const { error } = await supabase.from('book_snapshots').insert(batch);
      if (error) console.error('[db] snapshot batch:', error.message);
    }
  }

  /** Persistencia inmediata de una ejecución: opp -> trade (FK) -> wallets -> bot_state. */
  async persistExecution(p: ExecutionPayload): Promise<void> {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('opportunities')
      .insert(p.oppRow)
      .select('id')
      .single();
    if (error || !data) {
      console.error('[db] exec opp insert:', error?.message);
      return;
    }
    const oppId = (data as { id: number }).id;

    const { error: tErr } = await supabase
      .from('trades')
      .insert({ ...p.tradeRowBase, opportunity_id: oppId });
    if (tErr) console.error('[db] trade insert:', tErr.message);

    const now = new Date().toISOString();
    const walletRows = p.walletSnapshot
      .map((w) => ({ exchange_id: this.exId(w.venue), asset: w.asset, balance: w.balance, updated_at: now }))
      .filter((r) => r.exchange_id != null);
    if (walletRows.length) {
      const { error: wErr } = await supabase
        .from('wallets')
        .upsert(walletRows, { onConflict: 'exchange_id,asset' });
      if (wErr) console.error('[db] wallets upsert:', wErr.message);
    }

    const { error: bErr } = await supabase
      .from('bot_state')
      .update({
        cumulative_pnl_usd: p.botState.cumulativePnlUsd,
        consecutive_losses: p.botState.consecutiveLosses,
        updated_at: now,
      })
      .eq('id', true);
    if (bErr) console.error('[db] bot_state update:', bErr.message);
  }
}
