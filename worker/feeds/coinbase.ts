// worker/feeds/coinbase.ts — Coinbase Advanced Trade WebSocket (canal level2, público, sin auth).
// Incremental: 1er mensaje 'snapshot' (libro completo) + 'update' (deltas). new_quantity="0" borra el nivel.
// Sub: {"type":"subscribe","product_ids":["BTC-USD"],"channel":"level2"}
// Msg: {"channel":"l2_data","events":[{"type":"snapshot"|"update","updates":[{"side":"bid"|"offer","price_level":"..","new_quantity":".."}]}]}
import { Feed } from './base';
import { L2Book } from './l2book';
import type { OrderBook, Quote } from '../core';

const SYMBOLS: Record<string, { product: string; quote: Quote }> = {
  'BTC/USD': { product: 'BTC-USD', quote: 'USD' },
  'BTC/USDT': { product: 'BTC-USDT', quote: 'USDT' },
};

interface L2Update {
  side?: string;
  price_level?: string;
  new_quantity?: string;
}
interface L2Event {
  type?: string;
  updates?: L2Update[];
}
interface L2Msg {
  channel?: string;
  events?: L2Event[];
}

export function createCoinbaseFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const m = SYMBOLS[pair];
  if (!m) return null;
  const book = new L2Book();

  return new Feed(
    {
      name: `coinbase:${pair}`,
      url: 'wss://advanced-trade-ws.coinbase.com',
      onOpen: (ws) => ws.send(JSON.stringify({ type: 'subscribe', product_ids: [m.product], channel: 'level2' })),
      onMessage: (data) => {
        const msg = JSON.parse(data) as L2Msg;
        if (msg.channel !== 'l2_data' || !Array.isArray(msg.events)) return null;
        for (const ev of msg.events) {
          if (ev.type === 'snapshot') book.reset();
          for (const u of ev.updates ?? []) {
            book.apply(u.side === 'bid' ? 'bid' : 'ask', +(u.price_level ?? 0), +(u.new_quantity ?? 0));
          }
        }
        const { bids, asks } = book.top(20);
        if (!bids.length || !asks.length) return null;
        return { venue: 'coinbase', base: 'BTC', quote: m.quote, pair, bids, asks, exchangeTs: 0, recvTs: Date.now() };
      },
    },
    onBook,
  );
}
