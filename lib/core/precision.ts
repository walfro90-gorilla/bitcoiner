// lib/core/precision.ts — Precisión de grado institucional en el BORDE de ejecución.
//
// Decisión de diseño (ver docs/DECISIONS.md): float64 es suficiente para el P&L (error ~1e-11 USD,
// ~7 órdenes de magnitud por debajo de 1 satoshi). Lo que SÍ es contractual es conformar cada orden a
// los FILTROS del exchange (tickSize/stepSize/minNotional): si rediondeas mal, el exchange RECHAZA la
// orden. Eso se hace con aritmética determinista en enteros (satoshis / "ticks"). Este módulo vive en
// el borde de ejecución (Simulated/Live adapters) para que la simulación coincida con lo que un
// exchange real llenaría (sim == live).

export const SATOSHIS_PER_BTC = 100_000_000;

/** BTC → satoshis (entero). Floor: nunca inventa fondos que no hay. */
export function toSatoshis(btc: number): number {
  return Math.floor(btc * SATOSHIS_PER_BTC + 1e-6);
}
export function fromSatoshis(sats: number): number {
  return sats / SATOSHIS_PER_BTC;
}

/** Decimales significativos de un step (0.01 → 2, 1e-5 → 5, 5 → 0). */
export function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0 || Number.isInteger(step)) return 0;
  const s = step.toExponential(); // p.ej. "1e-5", "2.5e-3"
  const m = /e([+-]\d+)/.exec(s);
  const exp = m ? parseInt(m[1], 10) : 0;
  const mantissaDecimals = (s.split('e')[0].split('.')[1] ?? '').length;
  return Math.max(0, mantissaDecimals - exp);
}

function roundDecimals(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Redondea a un múltiplo de `step` con aritmética entera estable (evita drift tipo 0.1+0.2). */
export function roundToStep(value: number, step: number, mode: 'floor' | 'nearest' = 'floor'): number {
  if (!(step > 0)) return value;
  const ratio = value / step;
  const n = mode === 'nearest' ? Math.round(ratio) : Math.floor(ratio + 1e-9);
  return roundDecimals(n * step, decimalsOf(step));
}

/** Redondea un PRECIO al tickSize (al más cercano, como los exchanges). */
export function roundToTick(price: number, tickSize: number): number {
  return roundToStep(price, tickSize, 'nearest');
}

/** Filtros de un símbolo en un exchange (subconjunto de los de Binance: PRICE_FILTER / LOT_SIZE / NOTIONAL). */
export interface ExchangeFilters {
  tickSize: number; // incremento de precio
  stepSize: number; // incremento de cantidad (lote)
  minNotional: number; // valor mínimo de la orden (precio × cantidad)
  minQty?: number; // cantidad mínima
}

export interface ConformResult {
  price: number;
  qty: number;
  notional: number;
  ok: boolean; // ¿cumple los mínimos tras redondear?
  reason?: 'min_qty' | 'min_notional' | 'zero_qty';
}

/**
 * Conforma (precio, cantidad) a los filtros del exchange con aritmética exacta.
 * Devuelve ok=false (con motivo) si tras redondear no cumple minQty/minNotional — exactamente
 * lo que el exchange real rechazaría. Lo usan los adapters (simulado y live) para coincidir.
 */
export function conformOrder(price: number, qty: number, f: ExchangeFilters): ConformResult {
  const p = roundToTick(price, f.tickSize);
  const q = roundToStep(qty, f.stepSize, 'floor');
  const notional = roundDecimals(p * q, 8);
  if (!(q > 0)) return { price: p, qty: q, notional, ok: false, reason: 'zero_qty' };
  if (f.minQty != null && q < f.minQty) return { price: p, qty: q, notional, ok: false, reason: 'min_qty' };
  if (notional < f.minNotional) return { price: p, qty: q, notional, ok: false, reason: 'min_notional' };
  return { price: p, qty: q, notional, ok: true };
}
