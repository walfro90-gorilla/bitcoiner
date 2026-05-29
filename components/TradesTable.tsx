'use client';
import { useTrades } from '@/lib/hooks';
import { fmtBtc, fmtTimeMs, fmtUsd, n } from '@/lib/format';
import { Badge, Card, SectionTitle } from './ui';

export function TradesTable() {
  const { trades } = useTrades(40);

  return (
    <Card className="overflow-hidden">
      <SectionTitle>Operaciones ejecutadas (simuladas)</SectionTitle>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-xs text-muted">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>Hora</th>
              <th>Par</th>
              <th className="!text-right">Vol BTC</th>
              <th className="!text-right">VWAP compra</th>
              <th className="!text-right">VWAP venta</th>
              <th className="!text-right">Fees</th>
              <th className="!text-right">P&L neto</th>
              <th className="!text-right">ms</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trades.map((t) => {
              const pnl = n(t.net_pnl_usd);
              const fees = n(t.buy_fee_usd) + n(t.sell_fee_usd) + n(t.withdrawal_fee_usd);
              return (
                <tr key={t.id} className="[&>td]:px-3 [&>td]:py-2 hover:bg-foreground/[0.03]">
                  <td className="whitespace-nowrap font-mono text-xs text-muted">{fmtTimeMs(t.executed_at)}</td>
                  <td className="whitespace-nowrap text-xs">{t.pair}</td>
                  <td className="text-right font-mono text-xs tabular-nums">{fmtBtc(t.base_volume)}</td>
                  <td className="text-right font-mono text-xs tabular-nums">{fmtUsd(t.vwap_buy)}</td>
                  <td className="text-right font-mono text-xs tabular-nums">{fmtUsd(t.vwap_sell)}</td>
                  <td className="text-right font-mono text-xs tabular-nums text-muted">{fmtUsd(fees)}</td>
                  <td className={`text-right font-mono text-xs font-semibold tabular-nums ${pnl >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtUsd(pnl)}
                  </td>
                  <td className="text-right font-mono text-xs tabular-nums text-muted">{t.execution_time_ms}</td>
                  <td>{t.partial ? <Badge tone="accent">parcial</Badge> : <Badge tone="up">{t.status}</Badge>}</td>
                </tr>
              );
            })}
            {trades.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted">
                  Aún no hay operaciones ejecutadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
