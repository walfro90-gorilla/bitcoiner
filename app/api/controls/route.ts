// app/api/controls/route.ts — Controles del bot (kill switch, umbral) vía service-role.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.trading_enabled === 'boolean') patch.trading_enabled = body.trading_enabled;
  if (typeof body.demo_mode === 'boolean') patch.demo_mode = body.demo_mode;
  if (typeof body.min_net_bps === 'number' && Number.isFinite(body.min_net_bps)) patch.min_net_bps = body.min_net_bps;
  if (typeof body.max_position_usd === 'number' && Number.isFinite(body.max_position_usd))
    patch.max_position_usd = body.max_position_usd;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'sin campos válidos' }, { status: 400 });

  patch.updated_at = new Date().toISOString();
  const sb = createAdminClient();
  const { error } = await sb.from('bot_state').update(patch).eq('id', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
