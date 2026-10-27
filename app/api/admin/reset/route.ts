// app/api/admin/reset/route.ts — Reinicia la simulación (truncate vía RPC). Protegido por passcode.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Sin ADMIN_KEY configurada no hay reset: el repo es público y un default sería una llave conocida.
  const adminKey = process.env.ADMIN_KEY;
  const key = req.headers.get('x-admin-key') ?? '';
  if (!adminKey || key !== adminKey) {
    return new NextResponse('Passcode inválido', { status: 401 });
  }
  const sb = createAdminClient();
  const { error } = await sb.rpc('reset_simulation');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
