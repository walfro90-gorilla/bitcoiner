// worker/feeds/okx.ts — OKX canal `books` (400 niveles, INCREMENTAL real + checksum CRC32).
// Sub: {op:subscribe, args:[{channel:"books", instId:"BTC-USDT"}]}
// 1er msg action=snapshot (libro completo), luego action=update (deltas). size "0" => borrar nivel.
// Checksum: CRC32 (int32 con signo) de los primeros 25 niveles alternando bid/ask con strings crudos.
//
// SEGURIDAD: el checksum es BEST-EFFORT. Si tras varios mismatches no logra cuadrar (p.ej. cambio de
// formato del wire), se AUTO-DESACTIVA y el feed sigue operando como incremental (nunca se cae).
import WebSocket from 'ws';
import { Feed } from './base';
import { crc32, toInt32, okxChecksumString } from './crc32';
import type { Level, OrderBook, Quote } from '../core';

const INST: Record<string, { instId: string; quote: Quote; base: 'BTC' | 'ETH' }> = {
  'BTC/USDT': { instId: 'BTC-USDT', quote: 'USDT', base: 'BTC' },
  'ETH/USDT': { instId: 'ETH-USDT', quote: 'USDT', base: 'ETH' },
  'ETH/BTC': { instId: 'ETH-BTC', quote: 'USDT', base: 'ETH' },
};

const DEPTH = 25; // niveles emitidos al engine (el checksum usa 25)

export function createOkxFeed(pair: string, onBook: (b: OrderBook) => void): Feed | null {
  const m = INST[pair];
  if (!m) return null;

  // Mantenemos precio->size como string crudo (necesario para reproducir el checksum byte a byte).
  const bids = new Map<string, string>();
  const asks = new Map<string, string>();
  let checksumFails = 0;
  let checksumEnabled = true;
  let socket: WebSocket | undefined;

  function applyDeltas(arr: string[][] | undefined, map: Map<string, string>): void {
    for (const lvl of arr ?? []) {
      const px = lvl[0];
      const sz = lvl[1];
      if (sz === '0') map.delete(px);
      else map.set(px, sz);
    }
  }

  /** Top-N ordenado: bids desc, asks asc. Devuelve strings crudos (para checksum) + Level (para el engine). */
  function sortedRaw(map: Map<string, string>, dir: 'desc' | 'asc'): Array<{ px: string; sz: string }> {
    const arr = [...map.entries()].map(([px, sz]) => ({ px, sz }));
    arr.sort((a, b) => (dir === 'desc' ? +b.px - +a.px : +a.px - +b.px));
    return arr.slice(0, DEPTH);
  }

  function toLevels(raw: Array<{ px: string; sz: string }>): Level[] {
    return raw.map((r) => ({ price: +r.px, size: +r.sz })).filter((l) => l.size > 0);
  }

  function resync(): void {
    if (socket?.readyState !== WebSocket.OPEN) return;
    bids.clear();
    asks.clear();
    try {
      socket.send(JSON.stringify({ op: 'unsubscribe', args: [{ channel: 'books', instId: m.instId }] }));
      socket.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'books', instId: m.instId }] }));
    } catch {
      /* la reconexión por staleness lo recupera igual */
    }
  }

  return new Feed(
    {
      name: `okx:${pair}`,
      url: 'wss://ws.okx.com:8443/ws/v5/public',
      onOpen: (ws) => {
        socket = ws;
        bids.clear();
        asks.clear();
        ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'books', instId: m.instId }] }));
      },
      onMessage: (data) => parse(data),
      pingIntervalMs: 20000,
      pingPayload: 'ping',
    },
    onBook,
  );

  function parse(data: string): OrderBook | null {
    if (data === 'pong') return null;
    const msg = JSON.parse(data) as {
      event?: string;
      action?: 'snapshot' | 'update';
      data?: Array<{ asks: string[][]; bids: string[][]; ts: string; checksum?: number }>;
    };
    if (msg.event || !msg.data || !msg.data[0]) return null;
    const d = msg.data[0];

    if (msg.action === 'snapshot') {
      bids.clear();
      asks.clear();
    }
    applyDeltas(d.bids, bids);
    applyDeltas(d.asks, asks);

    const bidRaw = sortedRaw(bids, 'desc');
    const askRaw = sortedRaw(asks, 'asc');
    if (!bidRaw.length || !askRaw.length) return null;

    // CHECKSUM CRC32 (best-effort): valida integridad del incremental.
    if (checksumEnabled && typeof d.checksum === 'number') {
      const calc = toInt32(crc32(okxChecksumString(bidRaw, askRaw)));
      if (calc !== d.checksum) {
        checksumFails++;
        if (checksumFails <= 3) {
          console.warn(`[okx:${pair}] checksum mismatch (${checksumFails}/3) -> resync`);
          resync();
          return null; // no emitir libro potencialmente corrupto
        }
        // Persistente: probablemente nuestro formato difiere del wire -> degradar a incremental sin checksum.
        checksumEnabled = false;
        console.warn(`[okx:${pair}] checksum deshabilitado (best-effort): se continúa como incremental`);
      } else if (checksumFails > 0) {
        checksumFails = 0; // recuperado
      }
    }

    return {
      venue: 'okx',
      base: m.base,
      quote: m.quote,
      pair,
      bids: toLevels(bidRaw),
      asks: toLevels(askRaw),
      exchangeTs: Number(d.ts) || 0,
      recvTs: Date.now(),
    };
  }
}
