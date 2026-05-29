// lib/format.ts — formateo de números/moneda/tiempo para la UI.
export const n = (x: unknown): number => {
  const v = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
};

export const fmtUsd = (x: unknown, dp = 2): string =>
  `$${n(x).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const fmtNum = (x: unknown, dp = 2): string =>
  n(x).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtBps = (x: unknown): string => `${n(x).toFixed(2)} bps`;

export const fmtBtc = (x: unknown): string => `${n(x).toFixed(5)} ₿`;

export const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-MX', { hour12: false });

export const fmtTimeMs = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleTimeString('es-MX', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};
