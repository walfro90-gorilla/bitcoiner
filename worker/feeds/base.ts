// worker/feeds/base.ts — Wrapper de WebSocket: reconnect con backoff, heartbeat, parseo -> OrderBook.
import WebSocket from 'ws';
import type { OrderBook } from '../core';

export interface FeedOptions {
  name: string; // etiqueta para logs, p.ej. "binance:BTC/USDT"
  url: string;
  onOpen: (ws: WebSocket) => void; // enviar mensajes de suscripción
  onMessage: (data: string) => OrderBook | OrderBook[] | null; // parsear -> book(s)
  pingIntervalMs?: number;
  pingPayload?: string | (() => string); // p.ej. 'ping' (OKX); si no, usa ws.ping()
}

export class Feed {
  private ws?: WebSocket;
  private backoff = 250;
  private readonly maxBackoff = 8000;
  private pingTimer?: ReturnType<typeof setInterval>;
  private stopped = false;

  constructor(
    private readonly opts: FeedOptions,
    private readonly onBook: (b: OrderBook) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }
  stop(): void {
    this.stopped = true;
    this.clearPing();
    this.ws?.close();
  }

  private connect(): void {
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.on('open', () => {
      this.backoff = 250;
      try {
        this.opts.onOpen(ws);
      } catch (e) {
        console.error(`[${this.opts.name}] onOpen error: ${(e as Error).message}`);
      }
      this.startPing();
      console.log(`[${this.opts.name}] connected`);
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const res = this.opts.onMessage(raw.toString());
        if (!res) return;
        if (Array.isArray(res)) res.forEach((b) => this.onBook(b));
        else this.onBook(res);
      } catch {
        // mensaje no parseable / no relevante: ignorar
      }
    });

    ws.on('close', () => {
      this.clearPing();
      this.reconnect();
    });

    ws.on('error', (e: Error) => {
      console.error(`[${this.opts.name}] ws error: ${e.message}`);
      ws.close();
    });
  }

  private startPing(): void {
    if (!this.opts.pingIntervalMs) return;
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      const p =
        typeof this.opts.pingPayload === 'function' ? this.opts.pingPayload() : this.opts.pingPayload;
      if (p) this.ws.send(p);
      else this.ws.ping();
    }, this.opts.pingIntervalMs);
  }
  private clearPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  private reconnect(): void {
    if (this.stopped) return;
    const wait = this.backoff;
    this.backoff = Math.min(this.maxBackoff, this.backoff * 2) + Math.floor(Math.random() * 100);
    console.log(`[${this.opts.name}] reconnecting in ${wait}ms`);
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, wait);
  }
}
