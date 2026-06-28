'use client';
// components/LiveOrdersPanel.tsx — Órdenes en vivo + su máquina de estados (FSM real-ready).
// Muestra el ciclo de vida de cada orden (NEW→SENT→FILLED/PARTIALLY_FILLED/CANCELED/REJECTED).
// Fuente: trades simulados (sim), self-test del adapter (selftest) y órdenes REALES en Binance testnet (testnet).
import { useOrders, useOrderEvents, useExchanges } from '@/lib/hooks';
import { Card, SectionTitle, Badge, type Tone } from './ui';
import type { OrderRow } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';

const STATE_TONE: Record<string, Tone> = {
  FILLED: 'up',
  PARTIALLY_FILLED: 'blue',
  SENT: 'accent',
  NEW: 'accent',
  CANCELED: 'muted',
  EXPIRED: 'muted',
  REJECTED: 'down',
};

const SOURCE_LABEL: Record<string, { text: string; tone: Tone }> = {
  sim: { text: 'simulado', tone: 'muted' },
  selftest: { text: 'self-test', tone: 'blue' },
  testnet: { text: 'TESTNET REAL', tone: 'accent' },
};

function fmtQty(n: number): string {
  return n.toFixed(5);
}
function fmtPx(n: number): string {
  return n > 0 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
}

export function LiveOrdersPanel() {
  const orders = useOrders(12);
  const events = useOrderEvents(150);
  const { exchanges } = useExchanges();
  const nameByVenue = new Map(exchanges.map((e) => [e.venue, e.display_name]));

  // Agrupa eventos por order_id, ordenados por ts ascendente (la traza de la FSM).
  const trailById = new Map<number, string[]>();
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    const arr = trailById.get(e.order_id) ?? [];
    arr.push(e.to_state);
    trailById.set(e.order_id, arr);
  }

  const venueName = (v: string): string => nameByVenue.get(v) ?? v;

  return (
    <Card>
      <SectionTitle info="Ciclo de vida de cada orden con su máquina de estados. La misma FSM corre en simulado y en Binance testnet (real) — el salto a real es un adapter, no un rediseño.">
        Órdenes en vivo <span className="text-xs font-normal text-muted">· FSM real-ready</span>
      </SectionTitle>
      {orders.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted">
          Aún no hay órdenes. El self-test del adapter genera una cada minuto; los trades y la demo de testnet también aparecen aquí.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {orders.map((o) => (
            <OrderItem key={o.id} order={o} trail={trailById.get(o.id) ?? [o.state]} venueName={venueName} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function OrderItem({ order: o, trail, venueName }: { order: OrderRow; trail: string[]; venueName: (v: string) => string }) {
  const src = SOURCE_LABEL[o.source] ?? { text: o.source, tone: 'muted' as Tone };
  const sideTone = o.side === 'buy' ? 'up' : 'down';
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <Badge tone={sideTone}>{o.side === 'buy' ? 'COMPRA' : 'VENTA'}</Badge>
          <span className="font-medium text-foreground/90">{venueName(o.venue)}</span>
          <span className="text-muted">{o.symbol}</span>
          <span className="tabular-nums text-foreground/80">
            {fmtQty(o.qty)} @ {fmtPx(o.type === 'limit' && o.avg_price === 0 ? (o.limit_price ?? 0) : o.avg_price)}
          </span>
          <span className="text-[10px] uppercase text-muted">{o.type}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={src.tone}>{src.text}</Badge>
          <Badge tone={STATE_TONE[o.state] ?? 'default'}>{o.state}</Badge>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
        {trail.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-foreground/30">→</span>}
            <span className={cn(i === trail.length - 1 && 'font-medium text-foreground/70')}>{s}</span>
          </span>
        ))}
        {o.reject_reason ? <span className="ml-1 text-down">· {o.reject_reason}</span> : null}
      </div>
    </li>
  );
}
