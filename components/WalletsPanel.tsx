'use client';
import { useExchanges, useWallets } from '@/lib/hooks';
import { fmtNum } from '@/lib/format';
import { Card, SectionTitle } from './ui';

export function WalletsPanel() {
  const wallets = useWallets();
  const { name } = useExchanges();

  const byExchange = new Map<number, { asset: string; balance: number }[]>();
  for (const w of wallets) {
    const arr = byExchange.get(w.exchange_id) ?? [];
    arr.push({ asset: w.asset, balance: Number(w.balance) });
    byExchange.set(w.exchange_id, arr);
  }

  return (
    <Card className="overflow-hidden">
      <SectionTitle info="Saldos simulados por exchange y moneda. Se actualizan tras cada operación; el bot nunca permite que un saldo quede negativo (wallet guard).">
        Wallets simuladas
      </SectionTitle>
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {[...byExchange.entries()].map(([exId, assets]) => (
          <div key={exId} className="bg-card p-3">
            <div className="mb-2 text-xs font-semibold text-foreground/90">{name(exId)}</div>
            <div className="space-y-1">
              {assets.map((a) => (
                <div key={a.asset} className="flex justify-between text-xs">
                  <span className="text-muted">{a.asset}</span>
                  <span className="font-mono tabular-nums">{fmtNum(a.balance, a.asset === 'BTC' ? 5 : 2)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {wallets.length === 0 && (
          <div className="bg-card p-6 text-center text-sm text-muted col-span-full">Sin wallets.</div>
        )}
      </div>
    </Card>
  );
}
