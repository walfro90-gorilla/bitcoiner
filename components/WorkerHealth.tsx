'use client';
// components/WorkerHealth.tsx — Salud del worker inferida de la frescura de market_ticks (honesto: sin heartbeat extra).
// ponytail: HA real = elección de líder + 2ª VM, fuera de alcance seguro hoy
import { useEffect, useState } from 'react';
import { useMarketTicks } from '@/lib/hooks';
import { cn } from '@/lib/utils';

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function WorkerHealth() {
  const ticks = useMarketTicks();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const last = ticks.reduce((m, t) => Math.max(m, Date.parse(t.ts) || 0), 0);
  const age = last > 0 ? Math.max(0, Math.floor((now - last) / 1000)) : null;

  let dot: string, tone: string, txt: string;
  if (age !== null && age <= 8) {
    dot = 'animate-pulse bg-up';
    tone = 'text-up';
    txt = `Worker en línea · hace ${age}s`;
  } else if (age !== null && age <= 120) {
    dot = 'bg-accent';
    tone = 'text-accent';
    txt = `Worker con retraso · hace ${age}s`;
  } else {
    dot = 'bg-down';
    tone = 'text-down';
    txt = age !== null ? `Worker sin conexión · última señal hace ${mmss(age)}` : 'Worker sin conexión · sin datos aún';
  }

  return (
    <span
      className={cn('flex items-center gap-1.5 text-xs', tone)}
      title="Salud inferida de la frescura de los datos de mercado (market_ticks)"
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
      {txt}
    </span>
  );
}
