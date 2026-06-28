'use client';
// components/LivePing.tsx — Indicador en vivo de latencia de detección (punto pulsante + ms).
import { useLatencyStats } from '@/lib/hooks';
import { cn } from '@/lib/utils';

export function LivePing() {
  const stats = useLatencyStats(50);
  const det = stats.find((s) => s.detection_latency_ms != null)?.detection_latency_ms ?? null;
  const live = stats.length > 0;
  const txt = det == null ? '—' : det < 1 ? '<1 ms' : `${Math.round(det)} ms`;
  return (
    <span className="flex items-center gap-1.5 text-xs" title="Latencia de detección por evento (en vivo)">
      <span className={cn('h-2 w-2 rounded-full', live ? 'animate-pulse bg-up' : 'bg-muted')} />
      <span className="text-muted">detección</span>
      <span className="font-mono font-semibold text-foreground/90">{txt}</span>
    </span>
  );
}
