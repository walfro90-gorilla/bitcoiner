import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-border bg-card', className)}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold text-foreground/90">{children}</h2>
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
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  const valTone =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'accent' ? 'text-accent' : 'text-foreground';
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
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
};
