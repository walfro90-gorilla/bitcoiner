'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useBotState } from '@/lib/hooks';
import { fmtUsd, n } from '@/lib/format';
import { Card, SectionTitle, Stat } from '@/components/ui';
import { cn } from '@/lib/utils';

export default function AdminPage() {
  const { botState, mutate } = useBotState();
  const [busy, setBusy] = useState(false);
  const [minBps, setMinBps] = useState('');
  const [maxPos, setMaxPos] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!botState) return;
    if (minBps === '') setMinBps(String(botState.min_net_bps));
    if (maxPos === '') setMaxPos(String(botState.max_position_usd));
  }, [botState, minBps, maxPos]);

  const trading = botState?.trading_enabled ?? true;
  const demo = botState?.demo_mode ?? true;
  const pnl = n(botState?.cumulative_pnl_usd);

  async function ctrl(patch: Record<string, unknown>) {
    setBusy(true);
    await fetch('/api/controls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await mutate();
    setBusy(false);
  }

  async function doReset() {
    if (!window.confirm('Esto BORRA oportunidades, trades, noticias y snapshots, y reinicia P&L + wallets. ¿Continuar?'))
      return;
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': pass },
    });
    setMsg(r.ok ? '✅ Simulación reiniciada: P&L en $0 y wallets restauradas.' : `⚠️ ${(await r.text()) || 'Error'}`);
    await mutate();
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-bold tracking-tight">Panel de administración</h1>
      <p className="mb-5 text-xs text-muted">
        Controla el bot y administra la simulación. Los cambios llegan al worker remoto en ~2.5 s.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="P&L acumulado" value={fmtUsd(pnl)} tone={pnl >= 0 ? 'up' : 'down'} />
        <Stat label="Pérdidas seguidas" value={botState?.consecutive_losses ?? 0} />
        <Stat label="Modo" value={demo ? 'DEMO' : 'REAL'} tone={demo ? 'accent' : 'default'} />
        <Stat label="Trading" value={trading ? 'ON' : 'OFF'} tone={trading ? 'up' : 'down'} />
      </div>

      <div className="mt-3">
        <Card>
          <SectionTitle>Configuración del bot</SectionTitle>
          <div className="space-y-4 p-4">
            <Row label="Trading (kill switch)" help="Apaga toda ejecución; el bot sigue detectando.">
              <button
                disabled={busy}
                onClick={() => ctrl({ trading_enabled: !trading })}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-semibold',
                  trading ? 'bg-up/15 text-up hover:bg-up/25' : 'bg-down/15 text-down hover:bg-down/25',
                )}
              >
                {trading ? '● ON' : '■ OFF'}
              </button>
            </Row>
            <Row label="Modo de ejecución" help="DEMO ejecuta divergencias reales (neto chico). REAL solo neto ≥ umbral.">
              <button
                disabled={busy}
                onClick={() => ctrl({ demo_mode: !demo })}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-semibold',
                  demo ? 'bg-accent/15 text-accent hover:bg-accent/25' : 'bg-muted/15 text-muted hover:bg-muted/25',
                )}
              >
                {demo ? '◐ DEMO' : '○ REAL'}
              </button>
            </Row>
            <Row label="Umbral mínimo neto" help="Ganancia neta mínima (bps) para ejecutar.">
              <NumField value={minBps} onChange={setMinBps} onSave={() => ctrl({ min_net_bps: Number(minBps) })} busy={busy} suffix="bps" />
            </Row>
            <Row label="Posición máxima" help="Tope de notional por operación.">
              <NumField value={maxPos} onChange={setMaxPos} onSave={() => ctrl({ max_position_usd: Number(maxPos) })} busy={busy} suffix="USD" />
            </Row>
          </div>
        </Card>
      </div>

      <div className="mt-3">
        <Card className="border-down/40">
          <SectionTitle>
            <span className="text-down">⚠ Zona de peligro</span>
          </SectionTitle>
          <div className="space-y-3 p-4">
            <p className="text-xs text-muted">
              Reinicia la simulación: borra oportunidades, trades, noticias y snapshots; pone el P&L en $0 y restaura las
              wallets (1 BTC + 100k por exchange). Ideal justo antes de una demo.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="passcode admin"
                className="rounded-md bg-card2 px-3 py-2 text-xs outline-none placeholder:text-muted"
              />
              <button
                disabled={busy}
                onClick={doReset}
                className="rounded-md bg-down/20 px-3 py-2 text-xs font-semibold text-down hover:bg-down/30 disabled:opacity-50"
              >
                Reiniciar simulación
              </button>
              {msg && <span className="text-xs">{msg}</span>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted">{help}</div>
      </div>
      {children}
    </div>
  );
}

function NumField({
  value,
  onChange,
  onSave,
  busy,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  busy: boolean;
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 bg-transparent text-right font-mono text-xs outline-none"
      />
      <span className="text-xs text-muted">{suffix}</span>
      <button disabled={busy} onClick={onSave} className="ml-1 text-xs text-blue hover:underline">
        set
      </button>
    </div>
  );
}
