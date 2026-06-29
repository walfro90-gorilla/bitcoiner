'use client';
// components/InventoryPanel.tsx — Inventario & Rebalanceo inteligente (Pilar 3).
// Reusa el MISMO núcleo (lib/core/rebalance) en el browser para mostrar el inventario por venue,
// detectar starvation y previsualizar el plan; el worker ejecuta el rebalanceo automático.
import {
  useWallets,
  useExchanges,
  useMarketTicks,
  useTransfers,
  useConfig,
  patchConfig,
} from '@/lib/hooks';
import { Card, SectionTitle, Badge } from './ui';
import {
  buildInventory,
  detectImbalances,
  planRebalance,
  operatingFloor,
  DEFAULT_FEES,
  type FeeTable,
  type RebalanceConfig,
  type Venue,
} from '@/lib/core';
import { fmtUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export function InventoryPanel() {
  const wallets = useWallets();
  const { byId, exchanges } = useExchanges();
  const nameByVenue = new Map(exchanges.map((e) => [e.venue, e.display_name]));
  const ticks = useMarketTicks();
  const transfers = useTransfers(12);
  const { config, mutate } = useConfig();

  const venueOf = (id: number): Venue | undefined => byId.get(id)?.venue as Venue | undefined;
  const nameOf = (id: number | null): string => (id != null ? byId.get(id)?.display_name ?? '—' : '—');

  // Precio BTC de referencia (binance:BTC/USDT mid, con fallback a cualquier BTC/USDT).
  const btcUsd =
    ticks.find((t) => t.pair === 'BTC/USDT' && byId.get(t.exchange_id)?.venue === 'binance')?.mid ??
    ticks.find((t) => t.pair === 'BTC/USDT')?.mid ??
    0;

  const snapshot = wallets
    .map((w) => ({ venue: venueOf(w.exchange_id), asset: w.asset, balance: Number(w.balance) }))
    .filter((s): s is { venue: Venue; asset: string; balance: number } => !!s.venue);

  const rc = config?.runtime_config;
  const cfg: RebalanceConfig = {
    minOperatingUsd: Number(rc?.rebalance_min_operating_usd ?? 20_000),
    runwayTrades: Number(rc?.rebalance_runway_trades ?? 3),
    maxPositionUsd: Number(config?.bot_state?.max_position_usd ?? 10_000),
    minTransferUsd: Number(rc?.rebalance_min_transfer_usd ?? 500),
    maxTransferUsd: Number(rc?.rebalance_max_transfer_usd ?? 50_000),
  };
  const auto = rc?.rebalance_auto ?? false;
  const floor = operatingFloor(cfg);

  // FeeTable desde la config (para el costo de withdrawal del plan).
  const fees: FeeTable = { ...DEFAULT_FEES };
  for (const f of config?.fee_config ?? []) {
    const v = venueOf(f.exchange_id);
    if (v) fees[v] = { takerBps: Number(f.taker_bps), makerBps: Number(f.maker_bps), withdrawalBtc: Number(f.withdrawal_btc) };
  }

  const inv = btcUsd > 0 ? buildInventory(snapshot, btcUsd) : [];
  const plans = btcUsd > 0 ? planRebalance(inv, detectImbalances(inv, cfg), fees, cfg, btcUsd).filter((p) => p.worthwhile) : [];

  async function toggleAuto() {
    await patchConfig({ scope: 'runtime', field: 'rebalance_auto', value: !auto });
    await mutate();
  }

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        info="Inventario operativo por exchange valuado en USD. Si un venue se queda sin BTC (para vender) o sin quote (para comprar) bajo el piso operativo, el motor planea mover fondos por la ruta más barata. Con AUTO activo, el worker ejecuta la transferencia (simulada) sin intervención."
        right={
          <button
            onClick={() => void toggleAuto()}
            className={cn(
              'focus-ring rounded-md px-2.5 py-1 text-xs font-semibold transition-ui',
              auto ? 'bg-up/20 text-up hover:bg-up/25' : 'bg-muted/20 text-muted hover:bg-muted/25',
            )}
          >
            {auto ? '🔄 AUTO ON' : '⏸ AUTO OFF'}
          </button>
        }
      >
        🔄 Inventario &amp; Rebalanceo
      </SectionTitle>

      <div className="p-4">
        {btcUsd <= 0 ? (
          <p className="text-xs text-muted">Esperando precio de referencia…</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">
              Piso operativo por venue: <span className="font-mono text-foreground/80">{fmtUsd(floor)}</span> (
              {cfg.runwayTrades} trades × {fmtUsd(cfg.maxPositionUsd)})
            </p>

            {/* Inventario por venue */}
            <div className="space-y-1.5">
              {inv.map((v) => {
                const btcLow = v.btcUsd < floor;
                const quoteLow = v.quoteUsd < floor;
                return (
                  <div key={v.venue} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs">
                    <span className="w-20 font-semibold text-foreground/90">{nameByVenue.get(v.venue) ?? v.venue}</span>
                    <span className={cn('font-mono', btcLow ? 'text-down' : 'text-foreground/70')} title="Valor BTC">
                      ₿ {fmtUsd(v.btcUsd)}
                    </span>
                    <span className={cn('font-mono', quoteLow ? 'text-down' : 'text-foreground/70')} title="Quote (USDT/USD)">
                      $ {fmtUsd(v.quoteUsd)}
                    </span>
                    {btcLow || quoteLow ? (
                      <Badge tone="down">{btcLow ? 'BTC bajo' : 'quote bajo'}</Badge>
                    ) : (
                      <Badge tone="up">ok</Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Plan / sugerencias */}
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold text-foreground/80">Plan de rebalanceo</div>
              {plans.length === 0 ? (
                <p className="text-xs text-muted">Inventario balanceado — sin transferencias necesarias ✓</p>
              ) : (
                <div className="space-y-1">
                  {plans.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-md bg-accent/5 px-2.5 py-1.5 text-xs">
                      <span>
                        Mover <span className="font-mono font-semibold">{p.asset === 'BTC' ? `${p.amount.toFixed(4)} BTC` : fmtUsd(p.amount)}</span>{' '}
                        ({fmtUsd(p.amountUsd)}) de <span className="font-semibold">{p.fromVenue}</span> → <span className="font-semibold">{p.toVenue}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="font-mono">costo {fmtUsd(p.costUsd)}</span>
                        <Badge tone={auto ? 'up' : 'muted'}>{auto ? 'auto' : 'sugerencia'}</Badge>
                      </span>
                    </div>
                  ))}
                  {!auto ? <p className="mt-1 text-xs text-muted">Activa <span className="text-up">AUTO</span> para que el worker las ejecute.</p> : null}
                </div>
              )}
            </div>

            {/* Transferencias recientes */}
            {transfers.length > 0 ? (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-foreground/80">Transferencias</div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {transfers.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-1 text-xs last:border-0">
                      <span>
                        <span className="font-semibold">{nameOf(t.from_exchange_id)}</span> →{' '}
                        <span className="font-semibold">{nameOf(t.to_exchange_id)}</span>{' '}
                        <span className="font-mono text-muted">
                          {t.asset === 'BTC' ? `${Number(t.amount).toFixed(4)} BTC` : fmtUsd(Number(t.amount))}
                        </span>
                      </span>
                      <Badge tone={t.status === 'completed' ? 'up' : t.status === 'in_transit' ? 'accent' : 'muted'}>
                        {t.status === 'completed' ? '✓ completada' : t.status === 'in_transit' ? '⏳ en tránsito' : t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
