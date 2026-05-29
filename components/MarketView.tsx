'use client';
// MarketView — Estado del mercado en vivo: BBO por exchange + matriz de arbitraje N×N.
// Cumple el requisito funcional #1 del reto: "mejor precio de compra (Ask) y venta (Bid) en cada plataforma".
import { useExchanges, useMarketTicks } from '@/lib/hooks';
import { fmtNum, n } from '@/lib/format';
import { Card, SectionTitle } from './ui';

const MATRIX_PAIR = 'BTC/USDT';
const priceDp = (quote: string): number => (quote === 'MXN' ? 0 : 2);

export function MarketGrid() {
  const ticks = useMarketTicks();
  const { name } = useExchanges();
  const rows = [...ticks].sort((a, b) => a.pair.localeCompare(b.pair) || a.exchange_id - b.exchange_id);

  return (
    <Card className="overflow-hidden">
      <SectionTitle right={<span className="live-dot text-xs text-up">● live</span>}>
        Estado del mercado · mejor bid/ask por exchange
      </SectionTitle>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-xs text-muted">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>Exchange</th>
              <th>Par</th>
              <th className="!text-right">Bid (compra)</th>
              <th className="!text-right">Ask (venta)</th>
              <th className="!text-right">Mid</th>
              <th className="!text-right">Spread</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((t) => (
              <tr key={`${t.exchange_id}:${t.pair}`} className="[&>td]:px-3 [&>td]:py-2 hover:bg-foreground/[0.03]">
                <td className="whitespace-nowrap text-xs font-medium">{name(t.exchange_id)}</td>
                <td className="whitespace-nowrap text-xs text-muted">{t.pair}</td>
                <td className="text-right font-mono text-xs tabular-nums text-up">{fmtNum(t.bid, priceDp(t.quote))}</td>
                <td className="text-right font-mono text-xs tabular-nums text-down">{fmtNum(t.ask, priceDp(t.quote))}</td>
                <td className="text-right font-mono text-xs tabular-nums text-muted">{fmtNum(t.mid, priceDp(t.quote))}</td>
                <td className="text-right font-mono text-xs tabular-nums text-muted">{n(t.spread_bps).toFixed(1)} bps</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                  Esperando datos del worker… (requiere redeploy con el muestreo de BBO activado)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function SpreadMatrix() {
  const ticks = useMarketTicks().filter((t) => t.pair === MATRIX_PAIR);
  const { name } = useExchanges();
  const venues = [...ticks].sort((a, b) => a.exchange_id - b.exchange_id);

  return (
    <Card className="overflow-hidden">
      <SectionTitle right={<span className="text-xs text-muted">{MATRIX_PAIR}</span>}>
        Matriz de arbitraje · comprar (col) → vender (fila)
      </SectionTitle>
      <div className="overflow-auto p-2">
        {venues.length < 2 ? (
          <div className="px-3 py-8 text-center text-sm text-muted">Esperando ≥2 exchanges con {MATRIX_PAIR}…</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted">
                <th className="px-2 py-1 text-left font-medium">vende ↓ / compra →</th>
                {venues.map((c) => (
                  <th key={c.exchange_id} className="px-2 py-1 text-right font-medium">
                    {name(c.exchange_id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {venues.map((rowV) => (
                <tr key={rowV.exchange_id}>
                  <td className="whitespace-nowrap px-2 py-1 font-medium text-foreground/80">{name(rowV.exchange_id)}</td>
                  {venues.map((colV) => {
                    if (rowV.exchange_id === colV.exchange_id)
                      return (
                        <td key={colV.exchange_id} className="px-2 py-1 text-right text-muted/40">
                          ·
                        </td>
                      );
                    const ask = n(colV.ask);
                    const edge = ask > 0 ? ((n(rowV.bid) - ask) / ask) * 1e4 : 0; // bps brutos
                    const pos = edge > 0;
                    return (
                      <td key={colV.exchange_id} className="px-2 py-1 text-right font-mono tabular-nums">
                        <span className={pos ? 'rounded bg-up/15 px-1 text-up' : 'text-muted'}>
                          {edge > 0 ? '+' : ''}
                          {edge.toFixed(1)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t border-border px-3 py-2 text-xs text-muted">
        Verde = ask(compra) &lt; bid(venta): arbitraje <strong className="text-foreground/80">bruto</strong> en bps. Casi
        siempre &lt; fees round-trip (~20 bps) → por eso el bot descarta (precisión).
      </div>
    </Card>
  );
}

export function MarketView() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <MarketGrid />
      <SpreadMatrix />
    </div>
  );
}
