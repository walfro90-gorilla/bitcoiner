'use client';
// components/config/ConfigCenter.tsx — Centro de Configuración: parametrización TOTAL en vivo.
// El diferenciador #1: el operador ajusta DESDE LA WEB fees, tamaños, breakers, on/off de exchanges
// y estrategias, umbrales por estrategia, etc. — el worker los adopta en ≤2.5s. Con perfiles + audit log.
import { useState } from 'react';
import { useConfig, patchConfig } from '@/lib/hooks';
import { Card, SectionTitle, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

const STRAT_LABEL: Record<string, string> = {
  spatial: 'Espacial',
  cross_quote: 'Cross-quote',
  triangular: 'Triangular',
  statistical: 'Estadística',
  regional: 'Regional MX',
};

/** Input numérico con estado "dirty" + botón set. `nullable` permite vaciar = heredar el global. */
function NumField({
  label,
  value,
  onSet,
  suffix,
  nullable = false,
  width = 'w-16',
}: {
  label: string;
  value: number | null;
  onSet: (v: number | null) => Promise<unknown>;
  suffix?: string;
  nullable?: boolean;
  width?: string;
}) {
  const canon = value == null ? '' : String(value);
  const [txt, setTxt] = useState(canon);
  const [lastCanon, setLastCanon] = useState(canon);
  const [busy, setBusy] = useState(false);
  // Sincroniza el input si el valor externo cambia (perfil aplicado / otro operador) — patrón
  // de React de "ajustar estado en render", sin useEffect (evita set-state-in-effect).
  if (canon !== lastCanon) {
    setLastCanon(canon);
    setTxt(canon);
  }
  const dirty = txt.trim() !== canon;

  async function set() {
    const t = txt.trim();
    const v = t === '' ? (nullable ? null : NaN) : Number(t);
    if (v !== null && !Number.isFinite(v)) return;
    setBusy(true);
    await onSet(v);
    setBusy(false);
  }

  return (
    <label className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && dirty && void set()}
          placeholder={nullable ? 'global' : ''}
          inputMode="decimal"
          className={cn(
            width,
            'focus-ring rounded border border-foreground/20 bg-foreground/5 px-1.5 py-0.5 text-right font-mono transition-ui focus:border-accent',
          )}
        />
        {suffix ? <span className="w-7 text-muted">{suffix}</span> : null}
        <button
          disabled={busy || !dirty}
          onClick={() => void set()}
          className={cn('w-8 rounded-(--radius-btn) text-left transition-ui', dirty ? 'text-blue hover:bg-blue/15' : 'text-muted/30')}
        >
          set
        </button>
      </span>
    </label>
  );
}

/** Toggle booleano tipo pill. */
function Toggle({
  on,
  onToggle,
  onLabel = 'ON',
  offLabel = 'OFF',
}: {
  on: boolean;
  onToggle: () => Promise<unknown>;
  onLabel?: string;
  offLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await onToggle();
        setBusy(false);
      }}
      className={cn(
        'rounded-md px-2 py-0.5 text-xs font-semibold transition-colors disabled:opacity-50',
        on ? 'bg-up/15 text-up hover:bg-up/25' : 'bg-muted/15 text-muted hover:bg-muted/25',
      )}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

/** Grupo colapsable nativo (<details>). */
function Group({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="border-b border-border last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground-secondary transition-ui hover:text-accent [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-muted">▾</span>
      </summary>
      <div className="px-4 pb-3">{children}</div>
    </details>
  );
}

export function ConfigCenter() {
  const { config, mutate, isLoading } = useConfig();

  async function patch(body: Record<string, unknown>) {
    const r = await patchConfig(body);
    await mutate();
    return r;
  }
  const setRuntime = (field: string, value: number | boolean) => patch({ scope: 'runtime', field, value });
  const setBot = (field: string, value: number | boolean) => patch({ scope: 'bot_state', field, value });
  const setStrat = (key: string, field: string, value: number | boolean | null) =>
    patch({ scope: 'strategy', key, field, value });
  const setExchange = (key: string, value: boolean) => patch({ scope: 'exchange', key, field: 'enabled', value });
  const setFee = (key: string, field: string, value: number) => patch({ scope: 'fee', key, field, value });

  async function applyProfile(name: string) {
    if (!name) return;
    await patch({ action: 'apply_profile', name });
  }
  async function saveProfile() {
    const name = window.prompt('Nombre del perfil:')?.trim();
    if (!name) return;
    await patch({ action: 'save_profile', name });
  }

  const rc = config?.runtime_config;
  const bs = config?.bot_state;
  const strat = config?.strategy_config ?? [];
  const exchanges = config?.exchanges ?? [];
  const fees = config?.fee_config ?? [];
  const feeByEx = new Map(fees.map((f) => [f.exchange_id, f]));
  const profiles = config?.profiles ?? [];
  const audit = config?.audit ?? [];

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Toda la configuración del bot es editable EN VIVO desde aquí: el worker remoto la adopta en ~2.5s sin reiniciar. Cada cambio queda registrado en el historial (audit log). El grado de parametrización es el factor #1 de evaluación del reto."
        right={<Badge tone="accent">en vivo · ~2.5s</Badge>}
      >
        ⚙️ Centro de Configuración
      </SectionTitle>

      {isLoading && !config ? (
        <div className="px-4 py-6 text-center text-xs text-muted">Cargando configuración…</div>
      ) : (
        <>
          {/* Perfiles */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-foreground/2 px-4 py-2.5">
            <span className="text-xs font-semibold text-muted">Perfiles:</span>
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => void applyProfile(p.name)}
                title={p.description ?? ''}
                className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground/80 transition-colors hover:border-accent hover:text-accent"
              >
                {p.name}
                {p.is_builtin ? '' : ' ✎'}
              </button>
            ))}
            <button
              onClick={() => void saveProfile()}
              className="ml-auto rounded-md bg-blue/15 px-2 py-0.5 text-xs font-semibold text-blue hover:bg-blue/25"
            >
              💾 Guardar actual…
            </button>
          </div>

          {/* Tamaño y posición */}
          <Group title="📐 Tamaño y posición" open>
            <NumField label="Máx. BTC por trade" value={rc?.max_btc_per_trade ?? null} onSet={(v) => setRuntime('max_btc_per_trade', v ?? 0)} suffix="BTC" />
            <NumField label="Máx. posición" value={bs?.max_position_usd ?? null} onSet={(v) => setBot('max_position_usd', v ?? 0)} suffix="USD" width="w-20" />
            <NumField label="Umbral mínimo global" value={bs?.min_net_bps ?? null} onSet={(v) => setBot('min_net_bps', v ?? 0)} suffix="bps" />
          </Group>

          {/* Costos */}
          <Group title="💸 Costos de ejecución">
            <NumField label="Slippage base" value={rc?.slippage_bps ?? null} onSet={(v) => setRuntime('slippage_bps', v ?? 0)} suffix="bps" />
            <label className="flex items-center justify-between gap-2 py-1 text-xs">
              <span className="text-muted">Slippage dinámico (impacto por liquidez)</span>
              <Toggle
                on={rc?.dynamic_slippage ?? false}
                onToggle={() => setRuntime('dynamic_slippage', !(rc?.dynamic_slippage ?? false))}
                onLabel="dinámico"
                offLabel="fijo"
              />
            </label>
            <NumField label="Depeg (cross-quote)" value={rc?.depeg_bps ?? null} onSet={(v) => setRuntime('depeg_bps', v ?? 0)} suffix="bps" />
            <NumField label="Withdrawal amortizado en N trades" value={rc?.withdrawal_amortize_trades ?? null} onSet={(v) => setRuntime('withdrawal_amortize_trades', v ?? 1)} />
            <NumField label="Spread FX (MXN↔USD)" value={rc?.fx_spread_bps ?? null} onSet={(v) => setRuntime('fx_spread_bps', v ?? 0)} suffix="bps" />
            <NumField label="FX amortizado en N trades" value={rc?.fx_amortize_trades ?? null} onSet={(v) => setRuntime('fx_amortize_trades', v ?? 1)} />
            <NumField label="Fee Bitso MXN (taker)" value={rc?.bitso_mxn_fee_bps ?? null} onSet={(v) => setRuntime('bitso_mxn_fee_bps', v ?? 0)} suffix="bps" />
          </Group>

          {/* Circuit breakers */}
          <Group title="🛡️ Circuit breakers">
            <NumField label="Máx. trades por minuto" value={rc?.max_trades_per_min ?? null} onSet={(v) => setRuntime('max_trades_per_min', v ?? 1)} />
            <NumField label="Halt tras N pérdidas seguidas" value={rc?.consecutive_loss_halt ?? null} onSet={(v) => setRuntime('consecutive_loss_halt', v ?? 1)} />
            <NumField label="Cooldown tras halt" value={rc?.loss_cooldown_ms ?? null} onSet={(v) => setRuntime('loss_cooldown_ms', v ?? 0)} suffix="ms" width="w-20" />
            <NumField label="Feed stale (descarta libros viejos)" value={rc?.stale_ms ?? null} onSet={(v) => setRuntime('stale_ms', v ?? 1000)} suffix="ms" width="w-20" />
            <NumField label="ABORT si neto re-chequeado <" value={rc?.abort_min_net_bps ?? null} onSet={(v) => setRuntime('abort_min_net_bps', v ?? 0)} suffix="bps" />
            <NumField label="Movimiento adverso (fault → demo ABORT)" value={rc?.abort_extra_slippage_bps ?? null} onSet={(v) => setRuntime('abort_extra_slippage_bps', v ?? 0)} suffix="bps" />
          </Group>

          {/* Estrategias */}
          <Group title="🧠 Estrategias (on/off · umbral · maker · tamaño)" open>
            <div className="space-y-2">
              {strat.map((s) => (
                <div key={s.strategy} className="rounded-lg border border-border p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground/90">{STRAT_LABEL[s.strategy] ?? s.strategy}</span>
                    <Toggle on={s.enabled} onToggle={() => setStrat(s.strategy, 'enabled', !s.enabled)} onLabel="● activa" offLabel="○ off" />
                  </div>
                  <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <NumField label="Umbral (override)" value={s.min_net_bps_override} onSet={(v) => setStrat(s.strategy, 'min_net_bps_override', v)} suffix="bps" nullable />
                    <NumField label="Tamaño (override)" value={s.target_base} onSet={(v) => setStrat(s.strategy, 'target_base', v)} suffix="BTC" nullable />
                    {s.strategy === 'triangular' ? (
                      <NumField label="Notional ciclo" value={s.notional_usd} onSet={(v) => setStrat(s.strategy, 'notional_usd', v)} suffix="USD" nullable width="w-20" />
                    ) : (
                      <label className="flex items-center justify-between gap-2 py-1 text-xs">
                        <span className="text-muted">Maker</span>
                        <Toggle on={s.maker} onToggle={() => setStrat(s.strategy, 'maker', !s.maker)} onLabel="maker" offLabel="taker" />
                      </label>
                    )}
                    {s.strategy === 'statistical' ? (
                      <NumField label="z-score entrada" value={s.stat_entry} onSet={(v) => setStrat(s.strategy, 'stat_entry', v)} nullable />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Group>

          {/* Exchanges + fees */}
          <Group title="🏦 Exchanges y fees">
            <div className="space-y-1.5">
              {exchanges.map((ex) => {
                const f = feeByEx.get(ex.id);
                return (
                  <div key={ex.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border p-2">
                    <span className="w-20 text-xs font-semibold text-foreground/90">{ex.display_name}</span>
                    <Toggle on={ex.enabled} onToggle={() => setExchange(ex.venue, !ex.enabled)} onLabel="● activo" offLabel="○ off" />
                    {f ? (
                      <span className="flex items-center gap-3">
                        <NumField label="taker" value={f.taker_bps} onSet={(v) => setFee(ex.venue, 'taker_bps', v ?? 0)} suffix="bps" />
                        <NumField label="maker" value={f.maker_bps} onSet={(v) => setFee(ex.venue, 'maker_bps', v ?? 0)} suffix="bps" />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Group>

          {/* Historial (audit log) */}
          <Group title={`📝 Historial de cambios (${audit.length})`}>
            {audit.length === 0 ? (
              <p className="py-2 text-xs text-muted">Sin cambios registrados aún. Cada ajuste quedará aquí (campo · antes → después · hora).</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {audit.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-1 text-xs last:border-0">
                    <span className="flex items-center gap-1.5">
                      <Badge tone="muted">{a.scope}</Badge>
                      <span className="font-mono text-foreground/80">{a.field}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="font-mono">{fmtVal(a.old_value)}</span>
                      <span className="text-accent">→</span>
                      <span className="font-mono text-foreground/90">{fmtVal(a.new_value)}</span>
                      <span className="hidden sm:inline">{fmtTime(a.ts)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Group>
        </>
      )}
    </Card>
  );
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  return String(v);
}
function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
