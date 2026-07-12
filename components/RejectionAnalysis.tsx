'use client';
// RejectionAnalysis — Por qué el bot NO ejecuta (criterio #2: precisión).
// Muestra la distribución de motivos de descarte + las oportunidades "casi rentables".
import { useRejectionStats } from '@/lib/hooks';
import { Badge, Card, SectionTitle, strategyTone } from './ui';

const LABELS: Record<string, string> = {
  below_threshold: 'No rentable tras costos',
  news_risk_off: 'Pausa por noticias (risk-off)',
  insufficient_balance: 'Saldo insuficiente',
  max_trades_per_min: 'Límite de frecuencia',
  cooldown_consecutive_losses: 'Enfriamiento por pérdidas',
  trading_disabled: 'Trading apagado',
  invalid_quote: 'Cotización inválida',
  rejected: 'Rechazada',
  ejecutada: 'Ejecutada ✓',
  vista: 'Vista',
};

export function RejectionAnalysis() {
  const { total, executed, byReason, nearMisses } = useRejectionStats(500);
  const entries = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  const execPct = total > 0 ? (executed / total) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="De las oportunidades detectadas, cuántas se ejecutaron y por qué se descartaron las demás. La mayoría: no son rentables tras comisiones. Eso es la disciplina del bot."
        right={<span className="text-xs text-muted">últimas {total}</span>}
      >
        🔍 Análisis de descartes
      </SectionTitle>

      <div className="border-b border-border px-4 py-3 text-xs leading-relaxed text-muted">
        De <strong className="text-foreground/90">{total}</strong> oportunidades detectadas, el bot ejecutó{' '}
        <strong className={executed > 0 ? 'text-up' : 'text-foreground/90'}>{executed}</strong> ({execPct.toFixed(1)}%).
        El resto se descartó — casi siempre porque <strong className="text-foreground/90">no son rentables tras
        costos</strong>. Detectar es fácil; <strong className="text-foreground/90">saber cuándo NO operar</strong> es la
        diferencia.
      </div>

      <div className="space-y-2 p-4">
        {entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Esperando oportunidades del worker…</p>
        ) : (
          entries.map(([reason, n]) => (
            <div key={reason} className="relative">
              <div className="flex items-center justify-between px-1 py-1 text-xs">
                <span className={reason === 'ejecutada' ? 'text-up' : 'text-foreground/80'}>
                  {LABELS[reason] ?? reason}
                </span>
                <span className="font-mono tabular-nums text-muted">
                  {n} · {total > 0 ? ((n / total) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
                <div
                  className={`h-full rounded-full ${reason === 'ejecutada' ? 'bg-up' : 'bg-accent/60'}`}
                  style={{ width: `${Math.max(3, (n / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {nearMisses.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 text-xs font-medium text-foreground/80">
            Casi rentables <span className="font-normal text-muted">— las que estuvieron más cerca del umbral</span>
          </div>
          <div className="space-y-1">
            {nearMisses.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <Badge tone={strategyTone[m.strategy] ?? 'default'}>{m.strategy}</Badge>
                <span className="font-mono tabular-nums text-muted">
                  bruto <span className="text-foreground/70">{m.gross_spread_bps.toFixed(1)}</span> → neto{' '}
                  <span className={m.net_spread_bps >= 0 ? 'text-up' : 'text-down'}>
                    {m.net_spread_bps.toFixed(1)} bps
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
