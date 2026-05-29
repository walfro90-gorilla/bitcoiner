// worker/feeds/kraken.ts — Kraken WebSocket v2 (book): snapshot + updates incrementales.
// Da BTC/USD y BTC/USDT nativos (clave para cross-quote USD<->USDT).
// NOTA: Kraken v2 NO envía removals al salir del depth; el cliente debe truncar al depth.
import { Feed } from './base';
import type { Level, OrderBook, Quote } from '../core';

const SYMBOLS: Record<string, { symbol: string; quote: Quote }> = {
  'BTC/USDT': { symbol: 'BTC/USDT', quote: 'USDT' },
  'BTC/USD': { symbol: 'BTC/USD', quote: 'USD' },
};

const DEPTH = 10;

interface KrakenLevel {
  price: number;
  qty: number;
}

function prune(map: Map<number, number>, dir: 'desc' | 'asc'): void {
  if (map.size <= DEPTH) return;
  const sorted = [...map.keys()].sort((a, b) => (dir === 'desc' ? b - a : a - b));
  for (const price of sorted.slice(DEPTH)) map.delete(price);
}

function topLevels(map: Map<number, number>, dir: 'desc' | 'asc'): Level[] {
  const arr: Level[] = [];
  for (const [price, size] of map) if (size > 0) arr.push({ price, size });
  arr.sort((a, b) => (dir === 'desc' ? b.price - a.price : a.price - b.price));
  return arr.slice(0, DEPTH);
}

export function createKrakenFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const m = SYMBOLS[pair];
  if (!m) return null;

  const bids = new Map<number, number>();
  const asks = new Map<number, number>();

  return new Feed(
    {
      name: `kraken:${pair}`,
      url: 'wss://ws.kraken.com/v2',
      onOpen: (ws) =>
        ws.send(
          JSON.stringify({
            method: 'subscribe',
            params: { channel: 'book', symbol: [m.symbol], depth: DEPTH, snapshot: true },
          }),
        ),
      onMessage: (data) => {
        const msg = JSON.parse(data) as {
          channel?: string;
          type?: string;
          data?: Array<{ bids?: KrakenLevel[]; asks?: KrakenLevel[]; timestamp?: string }>;
        };
        if (msg.channel !== 'book' || !msg.data || !msg.data[0]) return null;
        const d = msg.data[0];
        if (msg.type === 'snapshot') {
          bids.clear();
          asks.clear();
        }
        for (const b of d.bids ?? []) (b.qty === 0 ? bids.delete(b.price) : bids.set(b.price, b.qty));
        for (const a of d.asks ?? []) (a.qty === 0 ? asks.delete(a.price) : asks.set(a.price, a.qty));
        // Kraken no envía removals fuera del depth -> truncar para no acumular niveles obsoletos.
        prune(bids, 'desc');
        prune(asks, 'asc');

        const bidArr = topLevels(bids, 'desc');
        const askArr = topLevels(asks, 'asc');
        if (!bidArr.length || !askArr.length) return null;
        // Guarda anti-cruce: si quedó cruzado por desync, descarta este tick.
        if (bidArr[0].price >= askArr[0].price) return null;
        return {
          venue: 'kraken',
          base: 'BTC',
          quote: m.quote,
          pair,
          bids: bidArr,
          asks: askArr,
          exchangeTs: d.timestamp ? Date.parse(d.timestamp) : 0,
          recvTs: Date.now(),
        };
      },
    },
    onBook,
  );
}
