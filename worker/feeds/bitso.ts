// worker/feeds/bitso.ts — Bitso WebSocket (canal 'orders'): snapshot top-of-book del exchange MX.
// Bitso suele tener premium/descuento regional => arbitraje neto realmente rentable.
import { Feed } from './base';
import type { Level, OrderBook, Quote } from '../core';

const BOOKS: Record<string, { book: string; quote: Quote }> = {
  'BTC/USDT': { book: 'btc_usdt', quote: 'USDT' },
  'BTC/MXN': { book: 'btc_mxn', quote: 'MXN' },
};

interface BitsoEntry {
  r: string; // rate (precio)
  a: string; // amount (BTC)
}

function levels(arr: BitsoEntry[] | undefined, dir: 'desc' | 'asc'): Level[] {
  const out: Level[] = (arr ?? [])
    .map((e) => ({ price: Number(e.r), size: Number(e.a) }))
    .filter((l) => l.price > 0 && l.size > 0);
  out.sort((a, b) => (dir === 'desc' ? b.price - a.price : a.price - b.price));
  return out.slice(0, 20);
}

export function createBitsoFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const m = BOOKS[pair];
  if (!m) return null;

  return new Feed(
    {
      name: `bitso:${pair}`,
      url: 'wss://ws.bitso.com',
      onOpen: (ws) => ws.send(JSON.stringify({ action: 'subscribe', book: m.book, type: 'orders' })),
      onMessage: (data) => {
        const msg = JSON.parse(data) as {
          type?: string;
          payload?: { bids?: BitsoEntry[]; asks?: BitsoEntry[] };
        };
        if (msg.type !== 'orders' || !msg.payload) return null;
        const bids = levels(msg.payload.bids, 'desc');
        const asks = levels(msg.payload.asks, 'asc');
        if (!bids.length || !asks.length) return null;
        return {
          venue: 'bitso',
          base: 'BTC',
          quote: m.quote,
          pair,
          bids,
          asks,
          exchangeTs: 0,
          recvTs: Date.now(),
        };
      },
    },
    onBook,
  );
}
