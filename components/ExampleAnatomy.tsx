'use client';
// ExampleAnatomy — Reproduce el EJEMPLO EXACTO del brief del reto (Kraken $70,000 → Binance $70,250)
// con el modelo de costos de Clawbot. Ancla visual para que el jurado reconozca "su" ejemplo.
import { fmtUsd } from '@/lib/format';
import { Card, SectionTitle } from './ui';

const FEE = 0.001; // 0.1% taker (como en el ejemplo del reto)
const BUY = 70000;
const SELL = 70250;
const buyFee = BUY * FEE;
const sellFee = SELL * FEE;
const cost = BUY + buyFee;
const proceeds = SELL - sellFee;
const net = proceeds - cost;
const grossPct = ((SELL - BUY) / BUY) * 100;

export function ExampleAnatomy() {
  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="El ejemplo del reto, paso a paso: comprar barato, vender caro y restar comisiones = ganancia neta por BTC. Así evalúa el bot cada oportunidad antes de decidir si la ejecuta."
        right={<span className="text-xs text-muted">ejemplo del reto</span>}
      >
        🧬 Anatomía de una oportunidad
      </SectionTitle>
      <div className="p-4 text-sm">
        <table className="w-full text-xs">
          <thead className="text-muted">
            <tr className="[&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
              <th>Exchange</th>
              <th>Acción</th>
              <th className="!text-right">Precio</th>
              <th className="!text-right">Fee 0.1%</th>
              <th className="!text-right">Neto</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr className="[&>td]:py-1">
              <td>Kraken</td>
              <td className="text-down">Comprar (Ask)</td>
              <td className="text-right tabular-nums">{fmtUsd(BUY)}</td>
              <td className="text-right tabular-nums text-muted">{fmtUsd(buyFee)}</td>
              <td className="text-right tabular-nums">{fmtUsd(cost)}</td>
            </tr>
            <tr className="[&>td]:py-1">
              <td>Binance</td>
              <td className="text-up">Vender (Bid)</td>
              <td className="text-right tabular-nums">{fmtUsd(SELL)}</td>
              <td className="text-right tabular-nums text-muted">{fmtUsd(sellFee)}</td>
              <td className="text-right tabular-nums">{fmtUsd(proceeds)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-up/30 bg-up/10 px-3 py-2">
          <span className="text-xs text-muted">Ganancia neta por BTC</span>
          <span className="font-mono text-lg font-bold tabular-nums text-up">+{fmtUsd(net)}</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Spread bruto {grossPct.toFixed(2)}%. Clawbot calcula esto igual, pero sobre el <strong>VWAP real</strong> del
          libro (no top-of-book), con <strong>slippage</strong> y <strong>withdrawal</strong> incluidos y{' '}
          <strong>órdenes parciales</strong> si falta liquidez. En mercados eficientes este spread casi nunca aparece →
          por eso el bot <strong className="text-foreground/80">espera disciplinadamente</strong>.
        </p>
      </div>
    </Card>
  );
}
