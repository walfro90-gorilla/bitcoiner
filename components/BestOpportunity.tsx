'use client';
// BestOpportunity — Demuestra PRIORIZACIÓN (criterio #4): no toma "la primera",
// rankea por net_usd y resalta la mejor candidata reciente.
import { useExchanges, useOpportunities } from '@/lib/hooks';
import { fmtBps, fmtBtc, fmtUsd, n } from '@/lib/format';
import { Badge, Card, SectionTitle, strategyTone } from './ui';

function Mini({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
          tone === undefined ? 'text-foreground/90' : tone ? 'text-up' : 'text-down'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function BestOpportunity() {
  const { opportunities } = useOpportunities(60);
  const { name } = useExchanges();

  // Mejor del momento: rentables primero, luego mayor net_usd (igual que prioriza el motor).
  const best = [...opportunities].sort(
    (a, b) => (b.profitable ? 1 : 0) - (a.profitable ? 1 : 0) || n(b.net_usd) - n(a.net_usd),
  )[0];

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="De las divergencias detectadas hace poco, la de mayor ganancia neta. El bot la prioriza: ejecuta primero la mejor, no la primera que aparece."
        right={<span className="text-xs text-muted">prioriza por neto</span>}
      >
        🎯 Mejor oportunidad reciente
      </SectionTitle>
      <div className="p-4">
        {!best ? (
          <p className="py-6 text-center text-sm text-muted">Esperando oportunidades del worker…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Badge tone={strategyTone[best.strategy] ?? 'default'}>{best.strategy}</Badge>
              <span
                className={`font-mono text-2xl font-bold tabular-nums ${
                  n(best.net_usd) >= 0 ? 'text-up' : 'text-down'
                }`}
              >
                {fmtUsd(best.net_usd)}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted">comprar</span> <strong>{name(best.buy_exchange_id)}</strong>{' '}
              <span className="text-muted">→ vender</span> <strong>{name(best.sell_exchange_id)}</strong>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Net" value={fmtBps(best.net_spread_bps)} tone={n(best.net_spread_bps) >= 0} />
              <Mini label="Gross" value={fmtBps(best.gross_spread_bps)} />
              <Mini label="Vol" value={fmtBtc(best.max_exec_base)} />
            </div>
            <div className="text-xs text-muted">
              {best.profitable
                ? '✅ Rentable tras costos → candidata a ejecutar primero.'
                : '⛔ No rentable tras costos → el bot la descarta (esa es la precisión).'}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
