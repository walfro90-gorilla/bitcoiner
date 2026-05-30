'use client';
// MakerTakerCompare — Comparador en vivo del trade-off Maker vs Taker.
// Usa EL MISMO motor del bot (computeNetProfit) en el navegador sobre el ejemplo del reto.
// 100% frontend: no toca worker, DB ni P&L. Educa por qué maker rinde más pero con riesgo de no-fill.
import { useState } from 'react';
import { computeNetProfit, type FeeTable, type OrderBook } from '@/lib/core';
import { fmtUsd } from '@/lib/format';
import { Card, SectionTitle } from './ui';

// Escenario del reto: comprar en Kraken, vender en Binance (BTC/USDT).
const BUY: OrderBook = {
  venue: 'kraken', base: 'BTC', quote: 'USDT', pair: 'BTC/USDT',
  bids: [{ price: 69990, size: 5 }], asks: [{ price: 70000, size: 5 }], exchangeTs: 0, recvTs: 0,
};
const SELL: OrderBook = {
  venue: 'binance', base: 'BTC', quote: 'USDT', pair: 'BTC/USDT',
  bids: [{ price: 70250, size: 5 }], asks: [{ price: 70260, size: 5 }], exchangeTs: 0, recvTs: 0,
};
const TAKER_BPS = 10;

function compute(takerBps: number, makerBps: number, maker: boolean) {
  const fees: FeeTable = {
    binance: { takerBps, makerBps, withdrawalBtc: 0 },
    kraken: { takerBps, makerBps, withdrawalBtc: 0 },
    okx: { takerBps, makerBps, withdrawalBtc: 0 },
    bitso: { takerBps, makerBps, withdrawalBtc: 0 },
    bitstamp: { takerBps, makerBps, withdrawalBtc: 0 },
  };
  return computeNetProfit({ buyBook: BUY, sellBook: SELL, fees, targetBase: 1, slippageBps: 0, maker }, 0);
}

function ModeCard({
  title, sub, r, accent, highlight,
}: {
  title: string; sub: string; r: ReturnType<typeof compute>; accent: boolean; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-up/40 bg-up/[0.04]' : 'border-border bg-background/40'}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className={`font-mono text-xl font-bold tabular-nums ${r.netUsd >= 0 ? 'text-up' : 'text-down'}`}>
          {fmtUsd(r.netUsd)}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{sub}</div>
      <div className="mt-3 space-y-1 font-mono text-xs">
        <Line label="Compra a" value={fmtUsd(r.buy.vwap)} note={accent ? 'bid (mejor)' : 'ask'} />
        <Line label="Vende a" value={fmtUsd(r.sell.vwap)} note={accent ? 'ask (mejor)' : 'bid'} />
        <Line label="Bruto" value={fmtUsd(r.grossUsd)} />
        <Line label="Fees" value={`−${fmtUsd(r.buy.feeQuote + r.sell.feeQuote)}`} muted />
      </div>
    </div>
  );
}

function Line({ label, value, note, muted }: { label: string; value: string; note?: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={muted ? 'text-muted' : 'text-foreground/90'}>
        {value} {note && <span className="text-[10px] text-muted">({note})</span>}
      </span>
    </div>
  );
}

export function MakerTakerCompare() {
  const [makerBps, setMakerBps] = useState(5);
  const taker = compute(TAKER_BPS, makerBps, false);
  const maker = compute(TAKER_BPS, makerBps, true);
  const delta = maker.netUsd - taker.netUsd;
  const pct = taker.netUsd !== 0 ? (delta / Math.abs(taker.netUsd)) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Compara las dos formas de ejecutar el arbitraje sobre el ejemplo del reto, con el MISMO motor del bot. Taker cruza el spread (fill seguro); maker pone órdenes límite (mejor precio + fee menor, pero puede no llenarse)."
        right={<span className="text-xs text-muted">ejemplo del reto · 1 BTC</span>}
      >
        ⚖️ Maker vs Taker — el trade-off en vivo
      </SectionTitle>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <ModeCard
          title="Taker"
          sub="Cruza el spread · fill garantizado"
          r={taker}
          accent={false}
        />
        <ModeCard
          title="Maker"
          sub="Órdenes límite · mejor precio, riesgo de no-fill"
          r={maker}
          accent
          highlight={maker.netUsd > taker.netUsd}
        />
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
          <span className="text-xs text-muted">Ventaja del maker</span>
          <span className={`font-mono text-sm font-bold tabular-nums ${delta >= 0 ? 'text-up' : 'text-down'}`}>
            {delta >= 0 ? '+' : ''}{fmtUsd(delta)} / BTC {delta >= 0 ? `(+${pct.toFixed(0)}%)` : ''}
          </span>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <label className="text-muted">
            Fee maker: <span className="font-mono text-foreground/90">{makerBps} bps</span>{' '}
            <span className="text-[10px]">(taker fijo {TAKER_BPS} bps)</span>
          </label>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={makerBps}
          onChange={(e) => setMakerBps(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--color-accent,#f7931a)]"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Mueve el fee maker: con <strong className="text-foreground/80">{makerBps} bps</strong>, el maker rinde{' '}
          <strong className={delta >= 0 ? 'text-up' : 'text-down'}>{fmtUsd(maker.netUsd)}</strong> vs{' '}
          {fmtUsd(taker.netUsd)} del taker. Aun con el mismo fee, el maker gana por <strong>entrar a mejor precio</strong>{' '}
          (compra al bid, vende al ask). El costo: una orden pasiva <strong>puede no llenarse</strong> — por eso el bot
          usa taker por default.
        </p>
      </div>
    </Card>
  );
}
