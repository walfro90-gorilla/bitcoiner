// worker/feeds/kraken.ts — Kraken WebSocket v2 (book): snapshot + updates incrementales + CHECKSUM CRC32.
// Da BTC/USD y BTC/USDT nativos (clave para cross-quote USD<->USDT).
// NOTA: Kraken v2 NO envía removals al salir del depth; el cliente trunca al depth y verifica con checksum.
import WebSocket from 'ws';
import { Feed } from './base';
import { crc32, krakenChecksumString } from './crc32';
import type { Level, OrderBook, Quote } from '../core';

const SYMBOLS: Record<string, { symbol: string; quote: Quote }> = {
  'BTC/USDT': { symbol: 'BTC/USDT', quote: 'USDT' },
  'BTC/USD': { symbol: 'BTC/USD', quote: 'USD' },
};

const DEPTH = 10;
const PRICE_PREC = [0, 1, 2, 3, 4, 5];
const QTY_PREC = [4, 5, 6, 7, 8];

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
  // Precisión del checksum auto-detectada en el primer snapshot (Kraken: pp=1, qp=8 para BTC).
  let pricePrec = -1;
  let qtyPrec = -1;
  let resyncing = false;
  let socket: WebSocket | undefined; // capturado en onOpen para poder re-suscribir ante desync

  /** Prueba combinaciones de precisión contra el checksum del snapshot; latchea la que coincide. */
  function detectPrecision(askArr: Level[], bidArr: Level[], checksum: number): boolean {
    for (const pp of PRICE_PREC) {
      for (const qp of QTY_PREC) {
        const s = krakenChecksumString(
          askArr.map((a) => ({ price: a.price, qty: a.size })),
          bidArr.map((b) => ({ price: b.price, qty: b.size })),
          pp,
          qp,
        );
        if (crc32(s) === checksum) {
          pricePrec = pp;
          qtyPrec = qp;
          return true;
        }
      }
    }
    return false;
  }

  function verify(askArr: Level[], bidArr: Level[], checksum: number): boolean {
    if (pricePrec < 0) return true; // sin precisión detectada aún: no bloquear
    const s = krakenChecksumString(
      askArr.map((a) => ({ price: a.price, qty: a.size })),
      bidArr.map((b) => ({ price: b.price, qty: b.size })),
      pricePrec,
      qtyPrec,
    );
    return crc32(s) === checksum;
  }

  return new Feed(
    {
      name: `kraken:${pair}`,
      url: 'wss://ws.kraken.com/v2',
      onOpen: (ws) => {
        socket = ws;
        bids.clear();
        asks.clear();
        resyncing = false;
        ws.send(
          JSON.stringify({
            method: 'subscribe',
            params: { channel: 'book', symbol: [m.symbol], depth: DEPTH, snapshot: true },
          }),
        );
      },
      onMessage: (data) => {
        const msg = JSON.parse(data) as {
          channel?: string;
          type?: string;
          data?: Array<{ bids?: KrakenLevel[]; asks?: KrakenLevel[]; timestamp?: string; checksum?: number }>;
        };
        if (msg.channel !== 'book' || !msg.data || !msg.data[0]) return null;
        const d = msg.data[0];
        if (msg.type === 'snapshot') {
          bids.clear();
          asks.clear();
          resyncing = false;
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

        // CHECKSUM CRC32: integridad del libro. Si no coincide -> desync -> resync (re-suscribir).
        if (typeof d.checksum === 'number') {
          if (msg.type === 'snapshot' && pricePrec < 0) {
            detectPrecision(askArr, bidArr, d.checksum); // latch único de precisión
          }
          if (!verify(askArr, bidArr, d.checksum)) {
            if (!resyncing && socket?.readyState === WebSocket.OPEN) {
              resyncing = true;
              console.warn(`[kraken:${pair}] checksum mismatch -> resync`);
              try {
                socket.send(JSON.stringify({ method: 'unsubscribe', params: { channel: 'book', symbol: [m.symbol], depth: DEPTH } }));
                socket.send(JSON.stringify({ method: 'subscribe', params: { channel: 'book', symbol: [m.symbol], depth: DEPTH, snapshot: true } }));
              } catch {
                /* la reconexión por staleness lo recupera igual */
              }
            }
            return null; // no emitir un libro corrupto
          }
        }
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
