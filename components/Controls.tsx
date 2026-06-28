'use client';
import { useEffect, useState } from 'react';
import { useBotState } from '@/lib/hooks';
import { cn } from '@/lib/utils';

export function Controls() {
  const { botState, mutate } = useBotState();
  const [busy, setBusy] = useState(false);
  const [bps, setBps] = useState('');

  useEffect(() => {
    if (botState && bps === '') setBps(String(botState.min_net_bps));
  }, [botState, bps]);

  const enabled = botState?.trading_enabled ?? true;
  const demo = botState?.demo_mode ?? true;
  const [injected, setInjected] = useState(false);

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

  async function inject() {
    setBusy(true);
    await fetch('/api/controls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inject: true }),
    });
    setBusy(false);
    setInjected(true);
    setTimeout(() => setInjected(false), 4000);
  }

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
        disabled={busy}
        onClick={inject}
        data-tour="inject"
        title="Reproduce el ejemplo del reto ($70,000→$70,250) por el pipeline real: detección → simulación → P&L"
        className="rounded-md bg-blue/15 px-3 py-1.5 text-xs font-semibold text-blue transition-ui hover:bg-blue/25 disabled:opacity-50"
      >
        {injected ? '✓ inyectado' : '🧬 Reproducir ejemplo'}
      </button>
    </div>
  );
}
