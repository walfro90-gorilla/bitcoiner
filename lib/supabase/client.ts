// lib/supabase/client.ts — Cliente de navegador (anon, respeta RLS). Singleton para realtime.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let _client: ReturnType<typeof createClient> | null = null;

/** Cliente browser memoizado — reusar para no duplicar canales realtime. */
export function getSupabaseBrowser() {
  if (!_client) _client = createClient();
  return _client;
}
