'use client';
// DepthLadder — Profundidad del order book (top niveles) por venue, con barras de tamaño.
// Prueba que el bot tiene los libros COMPLETOS en RAM (no solo top-of-book) para el VWAP.
import { useState } from 'react';
import { useExchanges, useMarketTicks } from '@/lib/hooks';
import { fmtNum, n } from '@/lib/format';
import { Card, SectionTitle } from './ui';

const PAIR = 'BTC/USDT';
type Lvl = { price: number; size: number };

function Row({ price, size, max, side }: { price: number; size: number; max: number; side: 'ask' | 'bid' }) {
  const pct = Math.max(2, Math.min(100, (size / max) * 100));
  const color = side === 'ask' ? 'text-down' : 'text-up';
  const bar = side === 'ask' ? 'bg-down/15' : 'bg-up/15';
  return (
    <div className="relative flex items-center justify-between px-2 py-0.5">
      <div className={`absolute inset-y-0 right-0 ${bar}`} style={{ width: `${pct}%` }} />
      <span className={`relative tabular-nums ${color}`}>{fmtNum(price, 2)}</span>
      <span className="relative tabular-nums text-muted">{fmtNum(size, 4)}</span>
    </div>
  );
}

export function DepthLadder() {
  const ticks = useMarketTicks().filter((t) => t.pair === PAIR && ((t.asks?.length ?? 0) || (t.bids?.length ?? 0)));
  const { name } = useExchanges();
  const [sel, setSel] = useState<number | null>(null);
  const venues = [...ticks].sort((a, b) => a.exchange_id - b.exchange_id);
  const active = venues.find((v) => v.exchange_id === sel) ?? venues[0];

  const asks = ((active?.asks ?? []) as Lvl[]).slice(0, 8);
  const bids = ((active?.bids ?? []) as Lvl[]).slice(0, 8);
  const maxSize = Math.max(1e-9, ...asks.map((l) => n(l.size)), ...bids.map((l) => n(l.size)));

  return (
    <Card className="overflow-hidden">
      <SectionTitle right={<span className="text-xs text-muted">{PAIR}</span>}>📒 Profundidad del libro</SectionTitle>
      {venues.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-muted">
          Esperando profundidad del worker… (redeploy con el sampler de niveles activado)
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
            {venues.map((v) => (
              <button
                key={v.exchange_id}
                onClick={() => setSel(v.exchange_id)}
                className={`rounded px-2 py-0.5 text-xs ${
                  active?.exchange_id === v.exchange_id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-foreground/5'
                }`}
              >
                {name(v.exchange_id)}
              </button>
            ))}
          </div>
          <div className="p-2 font-mono text-xs">
            {[...asks].reverse().map((l, i) => (
              <Row key={`a${i}`} price={n(l.price)} size={n(l.size)} max={maxSize} side="ask" />
            ))}
            <div className="my-1 border-t border-dashed border-border" />
            {bids.map((l, i) => (
              <Row key={`b${i}`} price={n(l.price)} size={n(l.size)} max={maxSize} side="bid" />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
