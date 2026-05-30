// lib/core/types.ts — Tipos compartidos por el worker y la web. TS puro, sin dependencias.

export type Venue = 'binance' | 'okx' | 'kraken' | 'bitso' | 'bitstamp';
export type Quote = 'USDT' | 'USD' | 'MXN';
export type Asset = 'BTC' | 'ETH' | 'USDT' | 'USD' | 'MXN';
export type StrategyType = 'spatial' | 'cross_quote' | 'triangular' | 'statistical' | 'regional';

/** Identifica un feed único (venue + par), p.ej. "kraken:BTC/USD". */
export type VenueKey = string;

/** Un nivel del order book. `size` está en el activo BASE (BTC). */
export interface Level {
  price: number;
  size: number;
}

/** Order book normalizado, igual para todos los exchanges. */
export interface OrderBook {
  venue: Venue;
  base: Asset;
  quote: Quote;
  pair: string; // "BTC/USDT"
  bids: Level[]; // ordenado DESC por precio (mejor bid primero)
  asks: Level[]; // ordenado ASC por precio (mejor ask primero)
  exchangeTs: number; // ms reportado por el venue (0 si no lo provee)
  recvTs: number; // ms cuando lo parseamos (Date.now())
  seq?: number; // secuencia para feeds incrementales (okx books / kraken / bitso diff)
}

export interface FeeConfig {
  takerBps: number; // 10 = 0.10%
  makerBps: number;
  withdrawalBtc: number; // BTC fijo por retiro
}
export type FeeTable = Record<Venue, FeeConfig>;

/** Una pata (leg) de una operación simulada = una orden de mercado. */
export interface FillLeg {
  venue: Venue;
  side: 'buy' | 'sell';
  vwap: number;
  filledBase: number;
  quoteValue: number; // buy: quote gastado; sell: quote recibido (bruto, en quote del propio venue)
  feeQuote: number; // fee en quote del propio venue
  levelsConsumed: number;
  fullyFilled: boolean;
}

/** Oportunidad de arbitraje detectada (rentable o no). */
export interface Opportunity {
  strategy: StrategyType;
  buyVenue: Venue;
  sellVenue: Venue;
  pair: string;
  grossSpreadBps: number;
  netSpreadBps: number;
  maxExecBase: number;
  grossUsd: number;
  netUsd: number;
  profitable: boolean;
  exchangeTs: number;
  recvTs: number;
  detectedTs: number;
}

export function venueKey(venue: Venue, pair: string): VenueKey {
  return `${venue}:${pair}`;
}

export function midPrice(b: OrderBook): number | null {
  const bid = b.bids[0]?.price;
  const ask = b.asks[0]?.price;
  if (bid == null || ask == null) return null;
  return (bid + ask) / 2;
}
