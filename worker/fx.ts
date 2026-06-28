// worker/fx.ts — Tasa de cambio USDT/MXN para el premio Bitso.
// Fuente primaria: book usdt_mxn de Bitso (la tasa real de conversión). Fallback: API FX gratis sin key.
import WebSocket from 'ws';
import { RUNTIME } from './runtimeConfig';

let usdtMxn = 0;
let lastUpdate = 0;

/** USDT por 1 MXN... no: MXN por 1 USDT (precio de USDT en pesos). */
export function getUsdtMxn(): number {
  // Guard de FX stale (opt-in): si la tasa es más vieja que FX_MAX_AGE_MS, devuelve 0 (degradación
  // segura: el motor y el heartbeat ya tratan 0 como "sin FX" y saltan el premio regional).
  if (RUNTIME.fxMaxAgeMs > 0 && Date.now() - lastUpdate > RUNTIME.fxMaxAgeMs) return 0;
  return usdtMxn;
}
export function fxReady(): boolean {
  return usdtMxn > 0;
}

function connectBitso(): void {
  const ws = new WebSocket('wss://ws.bitso.com');
  ws.on('open', () => ws.send(JSON.stringify({ action: 'subscribe', book: 'usdt_mxn', type: 'orders' })));
  ws.on('message', (raw: WebSocket.RawData) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        type?: string;
        payload?: { bids?: { r: string }[]; asks?: { r: string }[] };
      };
      if (msg.type !== 'orders' || !msg.payload) return;
      const bids = (msg.payload.bids ?? []).map((e) => +e.r).filter((x) => x > 0);
      const asks = (msg.payload.asks ?? []).map((e) => +e.r).filter((x) => x > 0);
      if (bids.length && asks.length) {
        usdtMxn = (Math.max(...bids) + Math.min(...asks)) / 2;
        lastUpdate = Date.now();
      }
    } catch {
      /* ignore */
    }
  });
  ws.on('close', () => setTimeout(connectBitso, 2000));
  ws.on('error', () => ws.close());
}

async function pollFxApi(): Promise<void> {
  if (Date.now() - lastUpdate < 30000) return; // tenemos tasa fresca de Bitso
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const j = (await r.json()) as { rates?: { MXN?: number } };
    const mxn = j.rates?.MXN;
    if (mxn && mxn > 0) {
      usdtMxn = mxn; // USD ≈ USDT
      lastUpdate = Date.now();
    }
  } catch {
    /* ignore */
  }
}

/** Arranca la obtención del tipo de cambio USDT/MXN (Bitso usdt_mxn + fallback API FX). */
export function startFx(): void {
  connectBitso();
  void pollFxApi();
  setInterval(() => void pollFxApi(), 60000);
}
