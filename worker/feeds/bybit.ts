// worker/feeds/bybit.ts — Bybit v5 spot WebSocket (orderbook.50). Solo pares USDT (Bybit spot no tiene USD).
// Incremental: 'snapshot' (libro) + 'delta' (b/a cambiados; size "0" borra). Ping {"op":"ping"} cada 20s.
// Sub: {"op":"subscribe","args":["orderbook.50.BTCUSDT"]}
// Msg: {"topic":"orderbook.50.BTCUSDT","type":"snapshot"|"delta","data":{"b":[["p","s"]],"a":[["p","s"]],"u":..}}
import { Feed } from './base';
import { L2Book } from './l2book';
import type { OrderBook, Quote } from '../core';

const SYMBOLS: Record<string, { symbol: string; quote: Quote }> = {
  'BTC/USDT': { symbol: 'BTCUSDT', quote: 'USDT' },
};

interface BybitMsg {
  topic?: string;
  type?: string;
  ts?: number;
  data?: { b?: [string, string][]; a?: [string, string][] };
}

export function createBybitFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const m = SYMBOLS[pair];
  if (!m) return null;
  const book = new L2Book();

  return new Feed(
    {
      name: `bybit:${pair}`,
      url: 'wss://stream.bybit.com/v5/public/spot',
      pingIntervalMs: 20_000,
      pingPayload: () => JSON.stringify({ op: 'ping' }),
      onOpen: (ws) => ws.send(JSON.stringify({ op: 'subscribe', args: [`orderbook.50.${m.symbol}`] })),
      onMessage: (data) => {
        const msg = JSON.parse(data) as BybitMsg;
        if (typeof msg.topic !== 'string' || !msg.topic.startsWith('orderbook') || !msg.data) return null;
        if (msg.type === 'snapshot') book.reset();
        for (const [p, s] of msg.data.b ?? []) book.apply('bid', +p, +s);
        for (const [p, s] of msg.data.a ?? []) book.apply('ask', +p, +s);
        const { bids, asks } = book.top(20);
        if (!bids.length || !asks.length) return null;
        return { venue: 'bybit', base: 'BTC', quote: m.quote, pair, bids, asks, exchangeTs: msg.ts ?? 0, recvTs: Date.now() };
      },
    },
    onBook,
  );
}
