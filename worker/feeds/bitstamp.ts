// worker/feeds/bitstamp.ts — Bitstamp WebSocket v2 (canal order_book_*): snapshot top-100 completo.
// Patrón snapshot-replace (como Binance): cada push trae el libro completo, sin deltas ni checksum.
// Sub: {"event":"bts:subscribe","data":{"channel":"order_book_btcusdt"}}
// Msg: {"event":"data","data":{"bids":[["p","a"],...],"asks":[...],"microtimestamp":"..."}}
import { Feed } from './base';
import type { Level, OrderBook, Quote } from '../core';

const CHANNELS: Record<string, { channel: string; quote: Quote }> = {
  'BTC/USDT': { channel: 'order_book_btcusdt', quote: 'USDT' },
  'BTC/USD': { channel: 'order_book_btcusd', quote: 'USD' },
};

function lvls(arr: [string, string][] | undefined): Level[] {
  return (arr ?? []).map(([p, s]) => ({ price: +p, size: +s })).filter((l) => l.price > 0 && l.size > 0);
}

export function createBitstampFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const m = CHANNELS[pair];
  if (!m) return null;

  return new Feed(
    {
      name: `bitstamp:${pair}`,
      url: 'wss://ws.bitstamp.net',
      onOpen: (ws) => ws.send(JSON.stringify({ event: 'bts:subscribe', data: { channel: m.channel } })),
      onMessage: (data) => {
        const msg = JSON.parse(data) as {
          event?: string;
          data?: { bids?: [string, string][]; asks?: [string, string][]; microtimestamp?: string };
        };
        if (msg.event !== 'data' || !msg.data?.bids || !msg.data?.asks) return null; // ignora subscription_succeeded/heartbeat
        const bids = lvls(msg.data.bids).slice(0, 20);
        const asks = lvls(msg.data.asks).slice(0, 20);
        if (!bids.length || !asks.length) return null;
        return {
          venue: 'bitstamp',
          base: 'BTC',
          quote: m.quote,
          pair,
          bids,
          asks,
          exchangeTs: msg.data.microtimestamp ? Math.floor(+msg.data.microtimestamp / 1000) : 0,
          recvTs: Date.now(),
        };
      },
    },
    onBook,
  );
}
