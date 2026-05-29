// app/api/admin/reset/route.ts — Reinicia la simulación (truncate vía RPC). Protegido por passcode.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const key = req.headers.get('x-admin-key') ?? '';
  if (key !== (process.env.ADMIN_KEY || 'clawbot-admin')) {
    return new NextResponse('Passcode inválido', { status: 401 });
  }
  const sb = createAdminClient();
  const { error } = await sb.rpc('reset_simulation');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
