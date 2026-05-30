'use client';
// StrategyBreakdown — Desempeño por estrategia (criterio #4): trades, win-rate y P&L
// para cada una de las 5 estrategias. Demuestra que el bot corre varias en paralelo.
import { useStrategyStats } from '@/lib/hooks';
import { fmtUsd } from '@/lib/format';
import { Badge, Card, SectionTitle, strategyTone } from './ui';

const ALL = ['spatial', 'cross_quote', 'triangular', 'statistical', 'regional'] as const;

export function StrategyBreakdown() {
  const stats = useStrategyStats();

  return (
    <Card className="overflow-hidden">
      <SectionTitle info="Resultados de cada una de las 5 estrategias: número de operaciones, % de aciertos (win-rate) y ganancia/pérdida total.">
        Desempeño por estrategia
      </SectionTitle>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-xs text-muted">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>Estrategia</th>
              <th className="!text-right">Trades</th>
              <th className="!text-right">Win-rate</th>
              <th className="!text-right">P&amp;L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ALL.map((s) => {
              const st = stats[s] ?? { trades: 0, wins: 0, pnl: 0 };
              const wr = st.trades ? (st.wins / st.trades) * 100 : 0;
              return (
                <tr key={s} className="[&>td]:px-3 [&>td]:py-2">
                  <td>
                    <Badge tone={strategyTone[s] ?? 'default'}>{s}</Badge>
                  </td>
                  <td className="text-right font-mono text-xs tabular-nums">{st.trades}</td>
                  <td className="text-right font-mono text-xs tabular-nums text-muted">
                    {st.trades ? `${wr.toFixed(0)}%` : '—'}
                  </td>
                  <td
                    className={`text-right font-mono text-xs font-semibold tabular-nums ${
                      st.pnl >= 0 ? 'text-up' : 'text-down'
                    }`}
                  >
                    {st.trades ? fmtUsd(st.pnl) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-3 py-2 text-xs text-muted">
        5 estrategias evaluadas en paralelo. En modo Real puede haber 0 trades (mercados eficientes); activa DEMO para
        poblar la mecánica.
      </div>
    </Card>
  );
}
