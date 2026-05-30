// worker/feeds/bitstamp.ts — Feed de Bitstamp (canal order_book_*, snapshot top-100 completo).
// Patrón snapshot-replace (como Binance): cada push trae el libro completo, sin deltas ni checksum.
import { Feed } from './base';
import { CONFIG } from '../config';
import type { OrderBook, Venue } from '../core';

const PAIR_TO_CHANNEL: Record<string, string> = {
  'BTC/USDT': 'order_book_btcusdt',
  'BTC/USD': 'order_book_btcusd',
};

export function createBitstampFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const channel = PAIR_TO_CHANNEL[pair];
  if (!channel) return null;
  const venue: Venue = 'bitstamp';

  return new Feed({
    url: 'wss://ws.bitstamp.net',
    name: `${venue}:${pair}`,
    staleMs: CONFIG.staleMs,
    subscribe: () => ({ event: 'bts:subscribe', data: { channel } }),
    onMessage: (msg) => {
      const m = msg as {
        event?: string;
        data?: { bids?: [string, string][]; asks?: [string, string][]; microtimestamp?: string };
      };
      if (m.event !== 'data' || !m.data?.bids || !m.data?.asks) return; // ignora subscription_succeeded
      const recvTs = Date.now();
      const book: OrderBook = {
        venue,
        base: 'BTC',
        quote: pair.split('/')[1] as OrderBook['quote'],
        pair,
        bids: m.data.bids.slice(0, 20).map(([p, s]) => ({ price: +p, size: +s })),
        asks: m.data.asks.slice(0, 20).map(([p, s]) => ({ price: +p, size: +s })),
        exchangeTs: m.data.microtimestamp ? Math.floor(+m.data.microtimestamp / 1000) : 0,
        recvTs,
        seq: undefined,
      };
      onBook(book);
    },
  });
}
