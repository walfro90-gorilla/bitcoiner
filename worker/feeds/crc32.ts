// worker/feeds/crc32.ts — CRC32 (IEEE 802.3) + constructores de string de checksum para OKX y Kraken.
// Se usa para verificar la integridad de los order books incrementales (detecta desync).

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC32 sin signo (0..2^32-1) de una cadena ASCII. */
export function crc32(str: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8) ^ TABLE[(crc ^ str.charCodeAt(i)) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** OKX entrega el checksum como int32 CON signo. */
export function toInt32(unsigned: number): number {
  return unsigned > 0x7fffffff ? unsigned - 0x100000000 : unsigned;
}

/**
 * OKX: CRC32 de los primeros 25 niveles alternando bid/ask:
 * "bidPx:bidSz:askPx:askSz:bidPx1:bidSz1:..." usando los STRINGS crudos del wire.
 */
export function okxChecksumString(
  bids: Array<{ px: string; sz: string }>,
  asks: Array<{ px: string; sz: string }>,
): string {
  const parts: string[] = [];
  for (let i = 0; i < 25; i++) {
    if (i < bids.length) parts.push(bids[i].px, bids[i].sz);
    if (i < asks.length) parts.push(asks[i].px, asks[i].sz);
  }
  return parts.join(':');
}

/** Kraken v2: formatea un valor a `precision` decimales, quita el '.' y los ceros a la izquierda. */
export function krakenFmt(value: number, precision: number): string {
  const s = value.toFixed(precision).replace('.', '');
  return s.replace(/^0+/, '') || '0';
}

/**
 * Kraken v2: concatena asks (10, asc) y luego bids (10, desc); por nivel, precio formateado + qty formateado.
 */
export function krakenChecksumString(
  asks: Array<{ price: number; qty: number }>,
  bids: Array<{ price: number; qty: number }>,
  pricePrec: number,
  qtyPrec: number,
): string {
  let s = '';
  for (const a of asks.slice(0, 10)) s += krakenFmt(a.price, pricePrec) + krakenFmt(a.qty, qtyPrec);
  for (const b of bids.slice(0, 10)) s += krakenFmt(b.price, pricePrec) + krakenFmt(b.qty, qtyPrec);
  return s;
}
