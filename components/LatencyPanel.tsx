'use client';
// LatencyPanel — Velocidad de detección (criterio #1 del reto): avg/p50/p95/p99 + feed lag.
import { useLatencyStats } from '@/lib/hooks';
import { n } from '@/lib/format';
import { Card, SectionTitle } from './ui';

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
const ms = (v: number): string => (v < 1 ? '<1 ms' : `${Math.round(v)} ms`);

export function LatencyPanel() {
  const rows = useLatencyStats(200);
  const det = rows.map((r) => n(r.detection_latency_ms)).sort((a, b) => a - b);
  const lag = rows
    .map((r) => n(r.feed_lag_ms))
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const avg = det.length ? det.reduce((s, x) => s + x, 0) / det.length : 0;
  const lagAvg = lag.length ? lag.reduce((s, x) => s + x, 0) / lag.length : 0;

  const cells = [
    { label: 'avg', value: ms(avg) },
    { label: 'p50', value: ms(percentile(det, 50)) },
    { label: 'p95', value: ms(percentile(det, 95)) },
    { label: 'p99', value: ms(percentile(det, 99)) },
  ];

  return (
    <Card className="overflow-hidden">
      <SectionTitle right={<span className="text-xs text-muted">{det.length} eventos</span>}>
        ⚡ Velocidad de detección (latencia de procesamiento)
      </SectionTitle>
      <div className="grid grid-cols-4 gap-2 p-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-background/40 p-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted">{c.label}</div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-accent">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-4 py-2 text-xs text-muted">
        Detección <strong className="text-foreground/80">event-driven</strong> (no polling): cada mensaje WS re-evalúa
        solo los pares afectados.
        {lag.length > 0 && (
          <>
            {' '}
            Latencia de red (feed lag) media <span className="font-mono text-foreground/80">{ms(lagAvg)}</span>.
          </>
        )}
      </div>
    </Card>
  );
}
