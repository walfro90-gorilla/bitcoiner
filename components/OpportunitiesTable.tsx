'use client';
import { useExchanges, useOpportunities } from '@/lib/hooks';
import { fmtBps, fmtBtc, fmtTimeMs, fmtUsd, n } from '@/lib/format';
import { Badge, Card, SectionTitle, strategyTone } from './ui';

export function OpportunitiesTable() {
  const { opportunities } = useOpportunities(60);
  const { name } = useExchanges();

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Cada diferencia de precio detectada, se ejecute o no. Gross = bruto, Net = tras comisiones, ms = latencia. Si no es rentable, la columna Estado indica por qué se descartó."
        right={<span className="live-dot text-xs text-up">● live</span>}
      >
        Oportunidades detectadas
      </SectionTitle>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-card text-xs text-muted">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>Hora</th>
              <th>Estrategia</th>
              <th>Ruta</th>
              <th className="!text-right">Gross</th>
              <th className="!text-right">Net</th>
              <th className="!text-right">Net $</th>
              <th className="!text-right">Vol</th>
              <th className="!text-right">ms</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {opportunities.map((o) => {
              const net = n(o.net_spread_bps);
              return (
                <tr key={o.id} className="[&>td]:px-3 [&>td]:py-2 hover:bg-foreground/[0.03]">
                  <td className="whitespace-nowrap font-mono text-xs text-muted">{fmtTimeMs(o.detected_at)}</td>
                  <td>
                    <Badge tone={strategyTone[o.strategy] ?? 'default'}>{o.strategy}</Badge>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {name(o.buy_exchange_id)} <span className="text-muted">→</span> {name(o.sell_exchange_id)}
                  </td>
                  <td className="text-right font-mono text-xs tabular-nums">{fmtBps(o.gross_spread_bps)}</td>
                  <td className={`text-right font-mono text-xs tabular-nums ${net >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtBps(net)}
                  </td>
                  <td className={`text-right font-mono text-xs tabular-nums ${n(o.net_usd) >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtUsd(o.net_usd)}
                  </td>
                  <td className="text-right font-mono text-xs tabular-nums text-muted">{fmtBtc(o.max_exec_base)}</td>
                  <td className="text-right font-mono text-xs tabular-nums text-accent">
                    {o.detection_latency_ms == null ? '—' : o.detection_latency_ms < 1 ? '<1' : o.detection_latency_ms}
                  </td>
                  <td>
                    {o.executed ? (
                      <Badge tone="up">ejecutada</Badge>
                    ) : o.profitable ? (
                      <Badge tone="accent">{o.skip_reason ?? 'rentable'}</Badge>
                    ) : (
                      <Badge tone="muted">vista</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            {opportunities.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted">
                  Esperando oportunidades del worker…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
