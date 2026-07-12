// app/api/config/route.ts — Parametrización TOTAL en vivo (diferenciador #1).
// GET: snapshot completo de configuración. POST: patch validado por scope/field con audit log,
// o aplicar/guardar perfiles. Escribe vía service-role; el worker adopta los cambios en ≤2.5s.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyFieldChange, writeAudit } from '@/lib/config/apply';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const sb = createAdminClient();
  const [rc, sc, ex, fees, profiles, audit, bs] = await Promise.all([
    sb.from('runtime_config').select('*').eq('id', true).single(),
    sb.from('strategy_config').select('*').order('strategy'),
    sb.from('exchanges').select('*').order('id'),
    sb.from('fee_config').select('*').order('exchange_id'),
    sb.from('config_profiles').select('*').order('id'),
    sb.from('config_audit').select('*').order('ts', { ascending: false }).limit(50),
    sb.from('bot_state').select('*').eq('id', true).single(),
  ]);
  return NextResponse.json({
    runtime_config: rc.data ?? null,
    strategy_config: sc.data ?? [],
    exchanges: ex.data ?? [],
    fee_config: fees.data ?? [],
    profiles: profiles.data ?? [],
    audit: audit.data ?? [],
    bot_state: bs.data ?? null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = createAdminClient();

  // ── Perfiles ──
  if (body.action === 'save_profile') {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 });
    const [rc, sc, ex, fees] = await Promise.all([
      sb.from('runtime_config').select('*').eq('id', true).single(),
      sb.from('strategy_config').select('*'),
      sb.from('exchanges').select('venue, enabled'),
      sb.from('fee_config').select('*'),
    ]);
    const { data: bs } = await sb.from('bot_state').select('min_net_bps, demo_mode, max_position_usd').eq('id', true).single();
    const snapshot = { bot_state: bs, runtime_config: rc.data, strategy_config: sc.data, exchanges: ex.data, fee_config: fees.data };
    const { error } = await sb
      .from('config_profiles')
      .upsert({ name, description: String(body.description ?? ''), snapshot, is_builtin: false }, { onConflict: 'name' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(sb, 'profile', `save:${name}`, null, null);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'apply_profile') {
    const name = String(body.name ?? '');
    const { data: prof } = await sb.from('config_profiles').select('snapshot').eq('name', name).single();
    const snap = (prof as { snapshot?: Record<string, unknown> } | null)?.snapshot;
    if (!snap) return NextResponse.json({ error: 'perfil no encontrado' }, { status: 404 });
    const now = new Date().toISOString();
    if (snap.bot_state && typeof snap.bot_state === 'object') {
      const { error } = await sb.from('bot_state').update({ ...(snap.bot_state as object), updated_at: now }).eq('id', true);
      if (error) return NextResponse.json({ error: `apply_profile: bot_state — ${error.message}` }, { status: 500 });
    }
    if (snap.runtime_config && typeof snap.runtime_config === 'object') {
      const { id: _id, updated_at: _u, ...rcFields } = snap.runtime_config as Record<string, unknown>;
      void _id; void _u;
      const { error } = await sb.from('runtime_config').update({ ...rcFields, updated_at: now }).eq('id', true);
      if (error) return NextResponse.json({ error: `apply_profile: runtime_config — ${error.message}` }, { status: 500 });
    }
    for (const row of (Array.isArray(snap.strategy_config) ? snap.strategy_config : []) as Array<Record<string, unknown>>) {
      const { strategy, updated_at: _su, ...stFields } = row;
      void _su;
      if (strategy) {
        const { error } = await sb.from('strategy_config').update({ ...stFields, updated_at: now }).eq('strategy', strategy);
        if (error) return NextResponse.json({ error: `apply_profile: strategy_config(${String(strategy)}) — ${error.message}` }, { status: 500 });
      }
    }
    await writeAudit(sb, 'profile', `apply:${name}`, null, null);
    return NextResponse.json({ ok: true });
  }

  // ── Patch de un campo ── (lógica compartida con el copiloto en lib/config/apply.ts)
  const result = await applyFieldChange(sb, {
    scope: String(body.scope ?? ''),
    field: String(body.field ?? ''),
    value: body.value,
    key: body.key != null ? String(body.key) : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
