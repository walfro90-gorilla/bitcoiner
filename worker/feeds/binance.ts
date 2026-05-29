// worker/feeds/binance.ts — Binance partial depth (snapshot completo cada push).
// Stream: <symbol>@depth20@100ms  ->  { lastUpdateId, bids:[["p","q"]], asks:[...] }
import { Feed } from './base';
import type { Level, OrderBook, Quote } from '../core';

const SYMBOLS: Record<string, { symbol: string; quote: Quote }> = {
  'BTC/USDT': { symbol: 'btcusdt', quote: 'USDT' },
  'ETH/USDT': { symbol: 'ethusdt', quote: 'USDT' },
  'ETH/BTC': { symbol: 'ethbtc', quote: 'USDT' }, // quote nominal; ETH/BTC se usa solo en triangular
};

export function createBinanceFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const m = SYMBOLS[pair];
  if (!m) return null;
  const url = `wss://stream.binance.com:9443/ws/${m.symbol}@depth20@100ms`;
  return new Feed(
    { name: `binance:${pair}`, url, onOpen: () => {}, onMessage: (d) => parse(d, pair, m.quote) },
    onBook,
  );
}

function lvls(arr: [string, string][]): Level[] {
  return arr.map(([p, q]) => ({ price: +p, size: +q })).filter((l) => l.size > 0);
}

function parse(data: string, pair: string, quote: Quote): OrderBook | null {
  const msg = JSON.parse(data) as { lastUpdateId?: number; bids?: [string, string][]; asks?: [string, string][] };
  if (!msg.bids || !msg.asks) return null;
  const base = pair.startsWith('ETH') ? 'ETH' : 'BTC';
  return {
    venue: 'binance',
    base,
    quote,
    pair,
    bids: lvls(msg.bids),
    asks: lvls(msg.asks),
    exchangeTs: 0,
    recvTs: Date.now(),
    seq: msg.lastUpdateId,
  };
}
