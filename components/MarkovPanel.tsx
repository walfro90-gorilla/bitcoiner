'use client';
// MarkovPanel — Modelo de régimen del premio Bitso (cadena de Markov de 1er orden) sobre datos REALES.
// NO predice precios: estima cómo transita el premio entre regímenes. Arbitraje estadístico, web-only.
import { usePremiumSeries } from '@/lib/hooks';
import {
  buildMarkovModel,
  classifyRegime,
  nextStateDistribution,
  probEntersPremium,
  REGIME_LABELS,
  REGIME_STATES,
  type RegimeState,
} from '@/lib/core/markov';
import { Card, SectionTitle } from './ui';

const SHORT: Record<RegimeState, string> = {
  descuento: 'Desc.',
  neutral: 'Neutr.',
  premio_bajo: 'P.bajo',
  premio_alto: 'P.alto',
};

// Color de celda según probabilidad (0 → transparente, 1 → acento fuerte).
function cellStyle(p: number): React.CSSProperties {
  return { backgroundColor: `rgba(247, 147, 26, ${Math.min(0.85, p * 0.9)})` };
}

export function MarkovPanel() {
  const series = usePremiumSeries(2000);
  const premiums = series.map((s) => s.premiumBps);
  const model = buildMarkovModel(premiums, 0.5); // Laplace suave para estabilidad visual

  const current: RegimeState | null = premiums.length ? classifyRegime(premiums[premiums.length - 1]) : null;
  const nextDist = current ? nextStateDistribution(model, current) : [];
  const pPremium = current ? probEntersPremium(model, current) : 0;

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Modela el premio Bitso como 'regímenes' (descuento/neutral/premio) y estima la probabilidad de pasar de uno a otro, usando el historial real. NO predice el precio — anticipa el régimen, útil para pre-posicionar órdenes maker. Es arbitraje estadístico."
        right={<span className="text-xs text-muted">{model.transitions} transiciones</span>}
      >
        🔮 Régimen del premio · cadena de Markov
      </SectionTitle>

      {!current ? (
        <div className="px-4 py-8 text-center text-sm text-muted">Acumulando historial del premio…</div>
      ) : (
        <>
          <div className="border-b border-border px-4 py-3 text-xs leading-relaxed text-muted">
            Régimen actual: <strong className="text-accent">{REGIME_LABELS[current]}</strong>. Probabilidad de estar en{' '}
            <strong className="text-foreground/90">premio</strong> en el próximo paso:{' '}
            <strong className={pPremium >= 0.5 ? 'text-up' : 'text-foreground/90'}>{(pPremium * 100).toFixed(0)}%</strong>.
          </div>

          {/* Matriz de transición (heatmap) */}
          <div className="overflow-auto p-3">
            <table className="w-full text-center text-[11px]">
              <thead>
                <tr className="text-muted">
                  <th className="px-1 py-1 text-left font-medium">de ↓ / a →</th>
                  {REGIME_STATES.map((s) => (
                    <th key={s} className="px-1 py-1 font-medium">
                      {SHORT[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REGIME_STATES.map((from, i) => (
                  <tr key={from} className={from === current ? 'ring-1 ring-accent/40' : ''}>
                    <td className="whitespace-nowrap px-1 py-1 text-left font-medium text-foreground/80">
                      {SHORT[from]} {from === current && <span className="text-accent">●</span>}
                    </td>
                    {REGIME_STATES.map((_, j) => {
                      const p = model.matrix[i][j];
                      const seen = model.totals[i] > 0;
                      return (
                        <td key={j} className="px-1 py-1">
                          <div
                            className="rounded py-1 font-mono tabular-nums"
                            style={seen ? cellStyle(p) : undefined}
                            title={`${(p * 100).toFixed(1)}%`}
                          >
                            {seen ? `${(p * 100).toFixed(0)}%` : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Distribución del próximo estado desde el régimen actual */}
          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 text-xs font-medium text-foreground/80">
              Próximo régimen <span className="font-normal text-muted">desde {REGIME_LABELS[current]}</span>
            </div>
            <div className="space-y-1.5">
              {REGIME_STATES.map((s, j) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[11px] text-muted">{REGIME_LABELS[s]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(1, (nextDist[j] ?? 0) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground/80">
                    {((nextDist[j] ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted">
            Markov de 1er orden sobre <strong className="text-foreground/80">{model.samples}</strong> muestras reales.
            Modela el <strong>régimen</strong> (no el precio): alimenta el timing de órdenes maker — pre-posicionar
            cuando sube la probabilidad de premio.
          </div>
        </>
      )}
    </Card>
  );
}
