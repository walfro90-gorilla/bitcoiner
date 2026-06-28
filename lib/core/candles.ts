// lib/core/candles.ts — Agregador OHLC puro (sin I/O). Convierte un stream de precios (mid) en velas.
// Compartido por worker (las construye desde market mids) y, conceptualmente, por la web.

export interface Candle {
  t: number; // epoch en SEGUNDOS, inicio del bucket (formato UTCTimestamp de lightweight-charts)
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Acumula precios en velas de `bucketMs`. Emite la vela COMPLETADA cuando el bucket cambia. */
export class CandleAggregator {
  private cur: Candle | null = null;
  constructor(private readonly bucketMs = 60_000) {}

  /** Agrega una muestra de precio en `tsMs`. Devuelve la vela cerrada si el bucket avanzó, si no null. */
  add(price: number, tsMs: number): Candle | null {
    if (!Number.isFinite(price) || price <= 0) return null;
    const bucketSec = Math.floor(tsMs / this.bucketMs) * (this.bucketMs / 1000);
    if (!this.cur) {
      this.cur = { t: bucketSec, o: price, h: price, l: price, c: price };
      return null;
    }
    if (bucketSec > this.cur.t) {
      const done = this.cur;
      this.cur = { t: bucketSec, o: price, h: price, l: price, c: price };
      return done;
    }
    if (price > this.cur.h) this.cur.h = price;
    if (price < this.cur.l) this.cur.l = price;
    this.cur.c = price;
    return null;
  }

  /** Vela en formación (copia), o null si aún no hay muestras. */
  current(): Candle | null {
    return this.cur ? { ...this.cur } : null;
  }
}
