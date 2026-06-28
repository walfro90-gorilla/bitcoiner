'use client';
// BacktestPanel — Backtest histórico del premio Bitso MX sobre datos REALES (spread_history).
// "Con este costo round-trip, operar el premio histórico habría dado este P&L."
// 100% navegador: lee spread_history (ya capturado), no toca worker ni DB. Honesto: el costo es la variable.
import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePremiumSeries } from '@/lib/hooks';
import { fmtTime, fmtUsd } from '@/lib/format';
import { Card, SectionTitle } from './ui';

const NOTIONAL_USD = 1000; // tamaño por operación simulada

export function BacktestPanel() {
  const series = usePremiumSeries(2000);
  // El costo round-trip (fee Bitso MXN + spread FX) depende del tier de volumen.
  // Es la variable honesta: a costo bajo (alto volumen) el premio paga; a costo retail no.
  const [costBps, setCostBps] = useState(15);

  // Por cada muestra: si |premio| supera el costo, simulamos operar NOTIONAL y acumulamos la ganancia neta.
  let cum = 0;
  let trades = 0;
  const equity = series.map((s) => {
    const netBps = Math.abs(s.premiumBps) - costBps;
    if (netBps > 0) {
      cum += (netBps / 1e4) * NOTIONAL_USD;
      trades++;
    }
    return { t: s.ts, cum };
  });

  const finalPnl = cum;
  const maxPremium = series.reduce((m, s) => Math.max(m, Math.abs(s.premiumBps)), 0);
  const up = finalPnl >= 0;
  const color = up ? '#16c784' : '#ea3943';
  const breakeven = maxPremium > 0 && costBps >= maxPremium;

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Backtest sobre datos reales: reproduce el historial del premio Bitso MX y simula operar cada vez que el premio supera el costo round-trip. El costo (fee MXN + spread FX) depende del tier de volumen — muévelo para ver el punto de equilibrio. No es proyección inventada: son precios que ya capturamos."
        right={<span className="text-xs text-muted">{series.length} muestras reales</span>}
      >
        ⏮️ Backtest · premio Bitso MX (histórico real)
      </SectionTitle>

      <div className="grid grid-cols-3 gap-2 border-b border-border p-3">
        <Mini label="P&L simulado" value={fmtUsd(finalPnl)} tone={up} />
        <Mini label="Operaciones" value={String(trades)} />
        <Mini label="Premio máx" value={`${maxPremium.toFixed(1)} bps`} />
      </div>

      <div className="h-(--chart-h) p-3">
        {equity.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
            Acumulando historial del premio… (el worker registra el premio cada segundo)
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equity} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="bt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                tickFormatter={(v) => fmtTime(String(v))}
                tick={{ fill: '#8b95a5', fontSize: 10 }}
                minTickGap={56}
                stroke="#1f2733"
              />
              <YAxis tickFormatter={(v) => fmtUsd(v, 0)} tick={{ fill: '#8b95a5', fontSize: 10 }} width={56} stroke="#1f2733" />
              <Tooltip
                contentStyle={{ background: '#0f131c', border: '1px solid #1f2733', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l) => fmtTime(String(l))}
                formatter={(v) => [fmtUsd(v as number), 'P&L acum']}
              />
              <Area type="monotone" dataKey="cum" stroke={color} fill="url(#bt)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <label className="text-xs text-muted">
          Costo round-trip asumido: <span className="font-mono text-foreground/90">{costBps} bps</span>{' '}
          <span className="text-[10px]">(fee Bitso MXN + spread FX; menor a mayor volumen)</span>
        </label>
        <input
          type="range"
          min={0}
          max={60}
          step={1}
          value={costBps}
          onChange={(e) => setCostBps(Number(e.target.value))}
          className="mt-2 w-full"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Sobre <strong className="text-foreground/80">{series.length}</strong> muestras reales (premio máx{' '}
          {maxPremium.toFixed(1)} bps), con costo de <strong className="text-foreground/80">{costBps} bps</strong> habrías
          hecho <strong className="text-foreground/80">{trades}</strong> operaciones por{' '}
          <strong className={up ? 'text-up' : 'text-down'}>{fmtUsd(finalPnl)}</strong>.{' '}
          {breakeven ? (
            <>El costo supera al premio máximo → <strong className="text-foreground/80">0 operaciones</strong>: justo la
            disciplina del bot en Real.</>
          ) : (
            <>Sube el costo hasta {maxPremium.toFixed(0)} bps y verás el punto donde deja de ser rentable.</>
          )}
        </p>
      </div>
    </Card>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
          tone === undefined ? 'text-foreground/90' : tone ? 'text-up' : 'text-down'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
