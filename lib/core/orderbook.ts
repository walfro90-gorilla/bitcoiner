// lib/core/orderbook.ts — Utilidades sobre el order book: VWAP, liquidez, staleness.
import type { Level, OrderBook } from './types';

/** Suma de tamaño (BASE) de hasta `maxLevels` niveles. */
export function totalSize(levels: Level[]): number {
  let s = 0;
  for (const l of levels) s += l.size;
  return s;
}

export interface VwapResult {
  vwap: number; // precio promedio ponderado por volumen
  filledBase: number; // base efectivamente llenada (<= targetBase)
  quote: number; // Σ price*size consumido (gastado o recibido, bruto)
  levelsConsumed: number;
  fullyFilled: boolean;
}

/**
 * Camina `levels` consumiendo hasta `targetBase` de BASE.
 * Para COMPRAR pasar asks (asc); para VENDER pasar bids (desc).
 * Devuelve VWAP real + cuánto se pudo llenar (parcial si la liquidez no alcanza).
 */
export function walkVwap(levels: Level[], targetBase: number): VwapResult {
  let remaining = targetBase;
  let quote = 0;
  let filled = 0;
  let consumed = 0;
  for (const lvl of levels) {
    if (remaining <= 1e-12) break;
    const take = Math.min(remaining, lvl.size);
    quote += take * lvl.price;
    filled += take;
    remaining -= take;
    consumed++;
  }
  const vwap = filled > 0 ? quote / filled : 0;
  return { vwap, filledBase: filled, quote, levelsConsumed: consumed, fullyFilled: remaining <= 1e-9 };
}

export function bestBid(b: OrderBook): number | null {
  return b.bids[0]?.price ?? null;
}
export function bestAsk(b: OrderBook): number | null {
  return b.asks[0]?.price ?? null;
}

/** Un book se considera stale si no recibió updates en `staleMs`. */
export function isStale(b: OrderBook, now: number, staleMs: number): boolean {
  return now - b.recvTs > staleMs;
}
