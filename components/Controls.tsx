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

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={busy}
        onClick={() => post({ trading_enabled: !enabled })}
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
          enabled ? 'bg-up/15 text-up hover:bg-up/25' : 'bg-down/15 text-down hover:bg-down/25',
        )}
      >
        {enabled ? '● Trading ON' : '■ Trading OFF'}
      </button>
      <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
        <span className="text-xs text-muted">min net</span>
        <input
          value={bps}
          onChange={(e) => setBps(e.target.value)}
          className="w-10 bg-transparent text-right font-mono text-xs outline-none"
        />
        <span className="text-xs text-muted">bps</span>
        <button
          disabled={busy}
          onClick={() => post({ min_net_bps: Number(bps) })}
          className="ml-1 text-xs text-blue hover:underline"
        >
          set
        </button>
      </div>
    </div>
  );
}
