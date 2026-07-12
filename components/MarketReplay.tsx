'use client';
// MarketReplay — «rewind the market»: reproduce un fixture REAL empacado (lib/replayFixture)
// 100% en el navegador — sin worker, sin DB, cero egress. El jurado ve al bot volver a decidir
// frame a frame sobre 40 instantes reales: casi siempre el spread bruto NO cubre los fees.
import { useEffect, useState } from 'react';
import { REPLAY_CAPTURED_AT, REPLAY_FRAMES, type ReplayFrame } from '@/lib/replayFixture';
import { fmtBps, fmtNum, fmtUsd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, Card, SectionTitle } from './ui';

// Fee taker ida-y-vuelta asumido: ≈0.1% por lado. Ilustrativo — el motor real (lib/core/profit.ts)
// usa fees por venue + withdrawal + slippage y camina el order book por VWAP.
const ROUND_TRIP_TAKER_BPS = 20;
const FRAME_MS = 600;

function bestArb(frame: ReplayFrame) {
  const entries = Object.entries(frame.v);
  if (entries.length === 0) return null;
  let buy = entries[0]; // menor ask
  let sell = entries[0]; // mayor bid
  for (const e of entries) {
    if (e[1].ask < buy[1].ask) buy = e;
    if (e[1].bid > sell[1].bid) sell = e;
  }
  const grossBps = ((sell[1].bid - buy[1].ask) / ((sell[1].bid + buy[1].ask) / 2)) * 1e4;
  return {
    buyVenue: buy[0],
    buyAsk: buy[1].ask,
    sellVenue: sell[0],
    sellBid: sell[1].bid,
    grossBps,
    netBps: grossBps - ROUND_TRIP_TAKER_BPS,
  };
}

// El fixture es estático → todo lo derivable se precomputa una vez (determinista, cero I/O).
const N = REPLAY_FRAMES.length;
const BESTS = REPLAY_FRAMES.map(bestArb);
const GROSS = BESTS.map((b) => b?.grossBps ?? 0);

// Sparkline: gross_bps por frame + línea punteada del fee round-trip (el bruto casi nunca la alcanza).
const W = 200;
const H = 32;
const LO = Math.min(0, ...GROSS);
const HI = Math.max(ROUND_TRIP_TAKER_BPS, ...GROSS) * 1.08;
const sx = (k: number) => (N <= 1 ? W / 2 : (k / (N - 1)) * W);
const sy = (g: number) => H - ((g - LO) / (HI - LO || 1)) * H;
const SPARK_PTS = GROSS.map((g, k) => `${sx(k).toFixed(1)},${sy(g).toFixed(1)}`).join(' ');
const FEE_Y = sy(ROUND_TRIP_TAKER_BPS);

export function MarketReplay() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || N === 0) return;
    const id = setInterval(() => setI((p) => (p + 1) % N), FRAME_MS);
    return () => clearInterval(id);
  }, [playing]);

  if (N === 0) {
    return (
      <Card>
        <SectionTitle>⏮️ Replay del mercado · datos reales</SectionTitle>
        <p className="p-4 text-sm text-muted">Sin frames en el fixture.</p>
      </Card>
    );
  }

  const frame = REPLAY_FRAMES[i];
  const best = BESTS[i];
  const rentable = best !== null && best.netBps > 0;

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Replay «rewind the market»: instantes REALES de bid/ask capturados de los 7 exchanges y empacados en el bundle. El navegador re-ejecuta la decisión del bot frame a frame: mejor compra (ask más bajo) vs mejor venta (bid más alto), menos un fee taker ida-y-vuelta. Sin worker, sin DB, cero egress."
        right={<span className="text-xs text-muted">{N} frames reales</span>}
      >
        ⏮️ Replay del mercado · datos reales
      </SectionTitle>

      {/* Controles: play/pausa + scrub manual */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pausa' : 'Reproducir'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-sm text-foreground/90 transition-colors hover:border-accent hover:text-accent"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={N - 1}
          step={1}
          value={i}
          aria-label="Frame del replay"
          onChange={(e) => {
            setPlaying(false); // scrub manual pausa la reproducción
            setI(Number(e.target.value));
          }}
          className="w-full"
        />
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
          {i + 1}/{N} · t={frame.t}s
        </span>
      </div>

      {/* Sparkline: bruto vs fees a lo largo del replay */}
      <div className="border-b border-border px-4 py-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
          <line
            x1={0}
            x2={W}
            y1={FEE_Y}
            y2={FEE_Y}
            className="text-down/70"
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={sx(i)}
            x2={sx(i)}
            y1={0}
            y2={H}
            className="text-foreground/25"
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={SPARK_PTS}
            fill="none"
            className="text-accent"
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <p className="mt-1 text-[10px] text-muted">
          spread bruto (bps) por frame · <span className="text-down">- - fee round-trip ({ROUND_TRIP_TAKER_BPS} bps)</span>
        </p>
      </div>

      {/* BBO por venue en el frame actual, con la ruta resaltada */}
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-1.5 font-medium">Venue</th>
            <th className="px-2 py-1.5 text-right font-medium">Bid</th>
            <th className="px-4 py-1.5 text-right font-medium">Ask</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {Object.entries(frame.v).map(([name, q]) => {
            const isBuy = best !== null && name === best.buyVenue;
            const isSell = best !== null && name === best.sellVenue;
            return (
              <tr key={name} className={cn('border-t border-border/60', (isBuy || isSell) && 'bg-accent/5')}>
                <td className="px-4 py-1 font-sans">
                  <span className="text-foreground/90">{name}</span>{' '}
                  <span className="text-[10px] text-muted">{q.pair}</span>
                </td>
                <td className={cn('px-2 py-1 text-right', isSell ? 'font-semibold text-up' : 'text-foreground/80')}>
                  {fmtNum(q.bid)}
                  {isSell && <span className="ml-1 font-sans text-[9px] uppercase text-up">venta</span>}
                </td>
                <td className={cn('px-4 py-1 text-right', isBuy ? 'font-semibold text-accent' : 'text-foreground/80')}>
                  {fmtNum(q.ask)}
                  {isBuy && <span className="ml-1 font-sans text-[9px] uppercase text-accent">compra</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Decisión del instante */}
      {best && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-4 py-3 text-xs">
          <span className="font-medium text-foreground/90">
            Comprar en {best.buyVenue} <span className="font-mono tabular-nums">@ {fmtUsd(best.buyAsk)}</span> → Vender
            en {best.sellVenue} <span className="font-mono tabular-nums">@ {fmtUsd(best.sellBid)}</span>
          </span>
          <span className="font-mono tabular-nums text-muted">
            bruto {fmtBps(best.grossBps)} · neto <span className={rentable ? 'text-up' : 'text-down'}>{fmtBps(best.netBps)}</span>
          </span>
          <Badge tone={rentable ? 'up' : 'down'}>{rentable ? 'RENTABLE' : 'DESCARTADA — fees > spread'}</Badge>
        </div>
      )}

      <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted">
        Honesto: fixture REAL empacado ({REPLAY_CAPTURED_AT}), reproducido 100% en tu navegador — sin worker, sin DB,
        cero egress. Compara across venues tratando USD≈USDT de forma ilustrativa; el motor real modela el depeg
        USD/USDT y camina el order book por VWAP. Fee asumido: ROUND_TRIP_TAKER_BPS = {ROUND_TRIP_TAKER_BPS} bps
        (≈0.1% por lado).
      </p>
    </Card>
  );
}
