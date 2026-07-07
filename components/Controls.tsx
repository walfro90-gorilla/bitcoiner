'use client';
import { useEffect, useState } from 'react';
import { useBotState } from '@/lib/hooks';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/** Conteo exacto de trades — para confirmar que el inyector realmente ejecutó (no solo que se encoló). */
async function tradesCount(): Promise<number | null> {
  try {
    const { count } = await getSupabaseBrowser().from('trades').select('*', { count: 'exact', head: true });
    return count ?? 0;
  } catch {
    return null; // p.ej. Supabase restringido (402): no podemos confirmar → no mentimos con un ✓
  }
}

type InjectState = 'idle' | 'running' | 'done' | 'timeout';

export function Controls() {
  const { botState, mutate } = useBotState();
  const [busy, setBusy] = useState(false);
  const [bps, setBps] = useState('');

  useEffect(() => {
    if (botState && bps === '') setBps(String(botState.min_net_bps));
  }, [botState, bps]);

  const enabled = botState?.trading_enabled ?? true;
  const demo = botState?.demo_mode ?? true;
  const [inject, setInject] = useState<InjectState>('idle');

  async function post(patch: Record<string, unknown>) {
    setBusy(true);
    await fetch('/api/controls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await mutate();
    setBusy(false);
  }

  // El botón solo dispara: incrementa inject_seq; el WORKER (poll ~2.5s) reproduce el ejemplo y escribe el trade.
  // Por eso NO declaramos éxito al enviar: sondeamos el conteo de trades y solo confirmamos si de verdad subió.
  async function runInject() {
    setBusy(true);
    setInject('running');
    const before = await tradesCount();
    await fetch('/api/controls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inject: true }),
    });
    setBusy(false);

    let landed = false;
    if (before !== null) {
      for (let i = 0; i < 9; i++) {
        await new Promise((r) => setTimeout(r, 800)); // ~7.2s de ventana (cubre el poll de 2.5s del worker)
        const now = await tradesCount();
        if (now !== null && now > before) {
          landed = true;
          break;
        }
      }
    }
    if (landed) await mutate();
    setInject(landed ? 'done' : 'timeout');
    setTimeout(() => setInject('idle'), 5000);
  }

  const injectLabel =
    inject === 'running'
      ? '⏳ Ejecutando…'
      : inject === 'done'
        ? '✓ +$109.75 ejecutado'
        : inject === 'timeout'
          ? '⏳ Esperando al worker…'
          : '🧬 Reproducir ejemplo';

  return (
    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
      <button
        disabled={busy}
        onClick={() => post({ trading_enabled: !enabled })}
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-semibold transition-ui',
          enabled ? 'bg-up/20 text-up hover:bg-up/25' : 'bg-down/20 text-down hover:bg-down/25',
        )}
      >
        {enabled ? '● Trading ON' : '■ Trading OFF'}
      </button>
      <button
        disabled={busy}
        onClick={() => post({ demo_mode: !demo })}
        title="DEMO ejecuta divergencias reales aunque el neto sea pequeño"
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-semibold transition-ui',
          demo ? 'bg-accent/20 text-accent hover:bg-accent/25' : 'bg-muted/20 text-muted hover:bg-muted/25',
        )}
      >
        {demo ? '◐ DEMO' : '○ Real'}
      </button>
      <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
        <span className="text-xs text-muted">min net</span>
        <input
          value={bps}
          onChange={(e) => setBps(e.target.value)}
          className="focus-ring w-10 rounded-sm bg-transparent text-right font-mono text-xs"
        />
        <span className="text-xs text-muted">bps</span>
        <button
          disabled={busy}
          onClick={() => post({ min_net_bps: Number(bps) })}
          className="focus-ring ml-1 rounded-(--radius-btn) px-1.5 py-0.5 text-xs font-medium text-blue transition-ui hover:bg-blue/15 disabled:opacity-50"
        >
          set
        </button>
      </div>
      <button
        disabled={busy || inject === 'running'}
        onClick={runInject}
        data-tour="inject"
        title="Reproduce el ejemplo del reto ($70,000→$70,250) por el pipeline real: detección → simulación → P&L. Confirma la ejecución real (no solo el envío)."
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-semibold transition-ui disabled:opacity-50',
          inject === 'done'
            ? 'bg-up/15 text-up hover:bg-up/25'
            : inject === 'timeout'
              ? 'bg-accent/15 text-accent hover:bg-accent/25'
              : 'bg-blue/15 text-blue hover:bg-blue/25',
        )}
      >
        {injectLabel}
      </button>
    </div>
  );
}
