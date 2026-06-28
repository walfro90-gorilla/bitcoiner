// lib/core/__fixtures__/books.ts — Fixtures compartidos para los tests del núcleo y del worker.
// NO es un archivo de test (no termina en .test.ts) — solo provee builders reutilizables.
import type { FeeConfig, FeeTable, Level, OrderBook, Quote, Venue } from '../types';

/** Crea un order book BTC/<quote> normalizado para tests. */
export function book(venue: Venue, quote: Quote, bids: Level[], asks: Level[]): OrderBook {
  return { venue, base: 'BTC', quote, pair: `BTC/${quote}`, bids, asks, exchangeTs: 0, recvTs: Date.now() };
}

/** FeeTable plana: mismo taker/maker/withdrawal en los 5 venues. */
export function flatFees(takerBps: number, makerBps = takerBps, withdrawalBtc = 0): FeeTable {
  const f: FeeConfig = { takerBps, makerBps, withdrawalBtc };
  return { binance: { ...f }, okx: { ...f }, kraken: { ...f }, bitso: { ...f }, bitstamp: { ...f } };
}

/** Fees a 0.1% en todos los venues, sin withdrawal — iguala el supuesto del ejemplo del reto. */
export const fees10: FeeTable = flatFees(10, 10, 0);

/** Fees con maker (5 bps) < taker (10 bps) para ver el doble beneficio del maker. */
export const feesMaker: FeeTable = flatFees(10, 5, 0);
