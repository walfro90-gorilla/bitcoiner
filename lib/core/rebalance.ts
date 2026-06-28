// lib/core/rebalance.ts — Rebalanceo INTELIGENTE de inventario entre exchanges (Pilar 3).
// Núcleo puro (sin I/O): modelo de inventario en USD, detección de "starvation" (un venue sin
// combustible para el próximo trade) y motor de decisión que elige la ruta más barata, dimensiona
// hacia el objetivo y solo mueve cuando vale la pena (banda muerta + costo/beneficio). Testeable.
import type { FeeTable, Venue } from './types';
import { withdrawalBtc } from './fees';

/** Inventario de un venue, valuado en USD a un precio BTC de referencia. */
export interface VenueInventory {
  venue: Venue;
  btc: number; // BTC disponible
  quoteUsd: number; // USDT + USD disponibles (poder de compra), en USD
  btcUsd: number; // valor USD del BTC a precio de referencia
  totalUsd: number;
}

export interface RebalanceConfig {
  minOperatingUsd: number; // piso operativo por venue (quote y valor-BTC)
  runwayTrades: number; // # de trades de colchón
  maxPositionUsd: number; // tamaño típico de trade (de bot_state) → define el runway
  minTransferUsd: number; // banda muerta: no mover migajas
  maxTransferUsd: number; // tope por transferencia
}

export type ImbalanceAsset = 'BTC' | 'QUOTE';
export type ImbalanceReason = 'btc_starved' | 'quote_starved';

export interface Imbalance {
  venue: Venue;
  asset: ImbalanceAsset;
  deficitUsd: number; // cuánto falta para volver al piso
  reason: ImbalanceReason;
}

export interface RebalancePlan {
  fromVenue: Venue;
  toVenue: Venue;
  asset: 'BTC' | 'USDT'; // qué se mueve
  amount: number; // unidades del asset (BTC, o USD si es quote)
  amountUsd: number;
  costUsd: number; // costo de la transferencia (withdrawal + red)
  reason: ImbalanceReason;
  worthwhile: boolean; // ¿el beneficio operativo supera el costo? (lo "inteligente")
}

/** Piso efectivo: el mayor entre el mínimo operativo y el runway (N trades × tamaño típico). */
export function operatingFloor(cfg: RebalanceConfig): number {
  return Math.max(cfg.minOperatingUsd, cfg.runwayTrades * cfg.maxPositionUsd);
}

/** Construye el inventario por venue desde el snapshot del ledger. MXN se ignora (mercado local). */
export function buildInventory(
  snapshot: Array<{ venue: Venue; asset: string; balance: number }>,
  btcUsd: number,
): VenueInventory[] {
  const map = new Map<Venue, VenueInventory>();
  const get = (v: Venue) =>
    map.get(v) ?? map.set(v, { venue: v, btc: 0, quoteUsd: 0, btcUsd: 0, totalUsd: 0 }).get(v)!;
  for (const { venue, asset, balance } of snapshot) {
    const inv = get(venue);
    if (asset === 'BTC') inv.btc += balance;
    else if (asset === 'USDT' || asset === 'USD') inv.quoteUsd += balance;
    // MXN no se rebalancea cross-venue (es el mercado local de Bitso).
  }
  for (const inv of map.values()) {
    inv.btcUsd = inv.btc * btcUsd;
    inv.totalUsd = inv.btcUsd + inv.quoteUsd;
  }
  return [...map.values()];
}

/** Detecta venues sin combustible para operar: poco BTC (para vender) o poco quote (para comprar). */
export function detectImbalances(inv: VenueInventory[], cfg: RebalanceConfig): Imbalance[] {
  const floor = operatingFloor(cfg);
  const out: Imbalance[] = [];
  for (const v of inv) {
    if (v.btcUsd < floor) out.push({ venue: v.venue, asset: 'BTC', deficitUsd: floor - v.btcUsd, reason: 'btc_starved' });
    if (v.quoteUsd < floor) out.push({ venue: v.venue, asset: 'QUOTE', deficitUsd: floor - v.quoteUsd, reason: 'quote_starved' });
  }
  return out.sort((a, b) => b.deficitUsd - a.deficitUsd);
}

/**
 * Para cada desbalance, elige el venue ORIGEN con más excedente del mismo activo y dimensiona el
 * movimiento hacia el piso (capeado por excedente y maxTransfer). `worthwhile` = supera la banda
 * muerta y el costo (withdrawal/red) es ≤5% del valor movido → evita ping-pong y mover migajas.
 */
export function planRebalance(
  inv: VenueInventory[],
  imbalances: Imbalance[],
  fees: FeeTable,
  cfg: RebalanceConfig,
  btcUsd: number,
): RebalancePlan[] {
  const floor = operatingFloor(cfg);
  const plans: RebalancePlan[] = [];
  for (const imb of imbalances) {
    const assetUsdOf = (v: VenueInventory) => (imb.asset === 'BTC' ? v.btcUsd : v.quoteUsd);
    let best: VenueInventory | null = null;
    let bestSurplus = 0;
    for (const v of inv) {
      if (v.venue === imb.venue) continue;
      const surplus = assetUsdOf(v) - floor;
      if (surplus > bestSurplus) {
        bestSurplus = surplus;
        best = v;
      }
    }
    if (!best) continue;
    const amountUsd = Math.min(imb.deficitUsd, bestSurplus, cfg.maxTransferUsd);
    if (amountUsd <= 0) continue;
    const costUsd =
      imb.asset === 'BTC' && btcUsd > 0
        ? withdrawalBtc(fees, best.venue) * btcUsd
        : Math.max(1, amountUsd * 0.0005); // quote: costo de red/FX aprox (5 bps, piso $1)
    const amount = imb.asset === 'BTC' && btcUsd > 0 ? amountUsd / btcUsd : amountUsd;
    const worthwhile = amountUsd >= cfg.minTransferUsd && costUsd <= amountUsd * 0.05;
    plans.push({
      fromVenue: best.venue,
      toVenue: imb.venue,
      asset: imb.asset === 'BTC' ? 'BTC' : 'USDT',
      amount,
      amountUsd,
      costUsd,
      reason: imb.reason,
      worthwhile,
    });
  }
  return plans.sort((a, b) => b.amountUsd - a.amountUsd);
}
