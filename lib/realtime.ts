'use client';
// lib/realtime.ts — Canal Realtime singleton de Supabase con pub/sub por tabla + debounce.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowser } from './supabase/client';

type Cb = () => void;
const REALTIME_TABLES = ['opportunities', 'trades', 'wallets', 'bot_state', 'news_signals'] as const;
const subscribers = new Map<string, Set<Cb>>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
let channel: RealtimeChannel | null = null;

/** Coalesce ráfagas de eventos: a lo más un refresh por tabla cada 400ms. */
function notify(table: string): void {
  if (pending.has(table)) return;
  const id = setTimeout(() => {
    pending.delete(table);
    subscribers.get(table)?.forEach((cb) => cb());
  }, 400);
  pending.set(table, id);
}

function ensureChannel(): void {
  if (channel) return;
  const sb = getSupabaseBrowser();
  const ch = sb.channel('clawbot-realtime');
  for (const table of REALTIME_TABLES) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => notify(table));
  }
  ch.subscribe();
  channel = ch;
}

/** Suscribe un callback a cambios de una tabla. Devuelve función de limpieza. */
export function subscribeTable(table: string, cb: Cb): () => void {
  ensureChannel();
  let set = subscribers.get(table);
  if (!set) {
    set = new Set();
    subscribers.set(table, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}
