'use client';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-border bg-card', className)}>{children}</div>;
}

/**
 * Ícono 'i' con tooltip explicativo al pasar el mouse (o tap en móvil).
 * Usa posición `fixed` calculada desde el ícono para no ser recortado por el `overflow-hidden` de las tarjetas.
 */
export function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const half = 132; // mitad del ancho del tooltip (w-64 = 256px)
      const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
      setPos({ x, y: r.bottom + 8 });
    }
    setShow(true);
  };
  const close = () => setShow(false);

  return (
    <span className="relative inline-flex">
      <button
        ref={ref}
        type="button"
        aria-label="Más información"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={(e) => {
          e.preventDefault();
          if (show) close();
          else open();
        }}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-bold leading-none text-muted transition-colors hover:border-accent hover:text-accent"
      >
        i
      </button>
      {show && (
        <span
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
          className="pointer-events-none fixed z-[100] w-64 max-w-[80vw] -translate-x-1/2 rounded-lg border border-border bg-card p-3 text-left text-xs font-normal leading-relaxed text-foreground/80 shadow-2xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function SectionTitle({ children, right, info }: { children: ReactNode; right?: ReactNode; info?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground/90">
        {children}
        {info ? <InfoTip text={info} /> : null}
      </h2>
      {right}
    </div>
  );
}

export type Tone = 'up' | 'down' | 'muted' | 'accent' | 'blue' | 'default';

const toneClass: Record<Tone, string> = {
  up: 'text-up bg-up/10',
  down: 'text-down bg-down/10',
  muted: 'text-muted bg-muted/10',
  accent: 'text-accent bg-accent/10',
  blue: 'text-blue bg-blue/10',
  default: 'text-foreground/80 bg-foreground/10',
};

export function Badge({ tone = 'default', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium', toneClass[tone])}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  info,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  info?: string;
}) {
  const valTone =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'accent' ? 'text-accent' : 'text-foreground';
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {label}
        {info ? <InfoTip text={info} /> : null}
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', valTone)}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </Card>
  );
}

export const strategyTone: Record<string, Tone> = {
  spatial: 'blue',
  cross_quote: 'accent',
  triangular: 'up',
  statistical: 'muted',
  regional: 'accent',
};
