// worker/feeds/l2book.ts — Libro L2 incremental (snapshot + deltas) para feeds que NO mandan el libro
// completo en cada push (Coinbase advanced-trade level2, Bybit orderbook). Mantiene precio→tamaño y
// emite el top-N ordenado. size<=0 borra el nivel (semántica de delta de ambos exchanges).
import type { Level } from '../core';

export class L2Book {
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();

  reset(): void {
    this.bids.clear();
    this.asks.clear();
  }

  apply(side: 'bid' | 'ask', price: number, size: number): void {
    if (!Number.isFinite(price) || price <= 0) return;
    const m = side === 'bid' ? this.bids : this.asks;
    if (size > 0) m.set(price, size);
    else m.delete(price);
  }

  /** Top-N: bids descendente, asks ascendente. */
  top(n: number): { bids: Level[]; asks: Level[] } {
    const bids = [...this.bids.entries()].sort((a, b) => b[0] - a[0]).slice(0, n).map(([price, size]) => ({ price, size }));
    const asks = [...this.asks.entries()].sort((a, b) => a[0] - b[0]).slice(0, n).map(([price, size]) => ({ price, size }));
    return { bids, asks };
  }
}
