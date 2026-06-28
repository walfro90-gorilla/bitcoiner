// worker/rebalancer.ts — Rebalanceo INTELIGENTE y AUTOMATIZADO entre exchanges (Pilar 3).
// Corre FUERA del hot-path (timer ~5s). Construye inventario, detecta starvation, planea la ruta
// más barata y, si `rebalance_auto` está ON, ejecuta transferencias SIMULADAS con máquina de estados
// (in_transit -> completed vía setTimeout), moviendo el Ledger y cobrando el withdrawal.
import {
  buildInventory,
  detectImbalances,
  planRebalance,
  type FeeTable,
  type RebalanceConfig,
  type RebalancePlan,
} from './core';
import type { Ledger } from './state';
import type { Writer } from './writer';
import { alertRebalance } from './alerts';

export interface RebalanceRuntime extends RebalanceConfig {
  auto: boolean;
}

const ETA_MS = 8_000; // latencia simulada de la transferencia (visible en la demo)

export class Rebalancer {
  private timer?: ReturnType<typeof setInterval>;
  private active = new Set<string>(); // rutas en vuelo (idempotencia)

  constructor(
    private readonly ledger: Ledger,
    private readonly btcUsd: () => number,
    private readonly fees: () => FeeTable,
    private readonly cfg: () => RebalanceRuntime,
    private readonly writer: Writer,
    private readonly etaMs = ETA_MS, // inyectable para tests
  ) {}

  /** Ejecuta una sola pasada de evaluación/ejecución (para tests deterministas). */
  runOnce(): void {
    this.tick();
  }

  start(intervalMs = 5_000): void {
    this.timer = setInterval(() => this.tick(), intervalMs);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private tick(): void {
    const px = this.btcUsd();
    if (!(px > 0)) return;
    const c = this.cfg();
    if (!c.auto) return; // solo actúa en modo automático
    const inv = buildInventory(this.ledger.snapshot(), px);
    const plans = planRebalance(inv, detectImbalances(inv, c), this.fees(), c, px).filter((p) => p.worthwhile);
    for (const p of plans) {
      const route = `${p.fromVenue}->${p.toVenue}:${p.asset}`;
      if (this.active.has(route)) continue; // ya hay una transferencia en vuelo para esta ruta
      void this.execute(p, route, px);
    }
  }

  /** Ejecuta una transferencia simulada: debita el origen YA (fondos en tránsito), acredita el destino tras ETA. */
  private async execute(p: RebalancePlan, route: string, px: number): Promise<void> {
    this.active.add(route);
    const debitAsset = p.asset === 'BTC' ? 'BTC' : 'USDT';
    this.ledger.add(p.fromVenue, debitAsset, -p.amount);
    await this.writer.upsertWallets(this.ledger.snapshot());
    const id = await this.writer.insertTransfer({
      from_exchange_id: this.writer.exId(p.fromVenue),
      to_exchange_id: this.writer.exId(p.toVenue),
      asset: p.asset,
      amount: p.amount,
      amount_usd: p.amountUsd,
      cost_usd: p.costUsd,
      status: 'in_transit',
      reason: p.reason,
      eta_ms: this.etaMs,
      auto: true,
    });
    console.log(
      `[REBAL] ${p.fromVenue}->${p.toVenue} ${p.amount.toFixed(p.asset === 'BTC' ? 5 : 2)} ${p.asset} ` +
        `($${p.amountUsd.toFixed(0)}, costo $${p.costUsd.toFixed(2)}) en tránsito…`,
    );
    alertRebalance({ from: p.fromVenue, to: p.toVenue, asset: p.asset, amount: p.amount, usd: p.amountUsd });
    setTimeout(() => {
      void this.complete(p, route, id, px);
    }, this.etaMs);
  }

  private async complete(p: RebalancePlan, route: string, id: number | null, px: number): Promise<void> {
    // Acredita el destino restando el costo de transferencia (withdrawal/red).
    const creditAsset = p.asset === 'BTC' ? 'BTC' : 'USDT';
    const netAmount = p.asset === 'BTC' ? Math.max(0, p.amount - p.costUsd / px) : Math.max(0, p.amount - p.costUsd);
    this.ledger.add(p.toVenue, creditAsset, netAmount);
    await this.writer.upsertWallets(this.ledger.snapshot());
    if (id != null) await this.writer.updateTransfer(id, { status: 'completed', completed_at: new Date().toISOString() });
    this.active.delete(route);
    console.log(`[REBAL] ${p.fromVenue}->${p.toVenue} completada (${p.asset}).`);
  }
}
