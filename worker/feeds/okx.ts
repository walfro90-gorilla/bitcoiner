// worker/feeds/okx.ts — OKX books5 (snapshot top-5 cada 100ms, sin checksum).
// Sub: {op:subscribe, args:[{channel:"books5", instId:"BTC-USDT"}]}
// Msg: { arg, data:[{ asks:[["p","sz","0","n"]], bids:[...], ts }] }
import { Feed } from './base';
import type { Level, OrderBook, Quote } from '../core';

const INST: Record<string, { instId: string; quote: Quote; base: 'BTC' | 'ETH' }> = {
  'BTC/USDT': { instId: 'BTC-USDT', quote: 'USDT', base: 'BTC' },
  'ETH/USDT': { instId: 'ETH-USDT', quote: 'USDT', base: 'ETH' },
  'ETH/BTC': { instId: 'ETH-BTC', quote: 'USDT', base: 'ETH' },
};

export function createOkxFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const m = INST[pair];
  if (!m) return null;
  return new Feed(
    {
      name: `okx:${pair}`,
      url: 'wss://ws.okx.com:8443/ws/v5/public',
      onOpen: (ws) => ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'books5', instId: m.instId }] })),
      onMessage: (d) => parse(d, pair, m.quote, m.base),
      pingIntervalMs: 20000,
      pingPayload: 'ping',
    },
    onBook,
  );
}

function lvls(arr: string[][]): Level[] {
  return arr.map((a) => ({ price: +a[0], size: +a[1] })).filter((l) => l.size > 0);
}

function parse(data: string, pair: string, quote: Quote, base: 'BTC' | 'ETH'): OrderBook | null {
  if (data === 'pong') return null;
  const msg = JSON.parse(data) as {
    event?: string;
    data?: Array<{ asks: string[][]; bids: string[][]; ts: string }>;
  };
  if (msg.event || !msg.data || !msg.data[0]) return null;
  const d = msg.data[0];
  return {
    venue: 'okx',
    base,
    quote,
    pair,
    bids: lvls(d.bids),
    asks: lvls(d.asks),
    exchangeTs: Number(d.ts) || 0,
    recvTs: Date.now(),
  };
}
