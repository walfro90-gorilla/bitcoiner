// worker/execution/adapter.ts — Interfaz común de exchange (simulado y live comparten contrato).
// "Real-ready": SimulatedAdapter (default, fills contra el libro en RAM) y LiveAdapter (Binance Spot
// Testnet) implementan ESTA interfaz → el salto a real es enchufar otro adapter, no rediseñar.
import type { OrderBook, Venue } from '../core';
import type { OrderRequest, OrderResult } from './order';
import type { ExchangeFilters } from '../core';

export interface AdapterCapabilities {
  mode: 'simulated' | 'live';
  supportsCancel: boolean;
  supportsMaker: boolean;
  crossVenueTransfer: false; // DECISIÓN explícita: nunca ejecutamos arbitraje cross-venue real
  symbols: string[];
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

export interface ExchangeAdapter {
  readonly venue: Venue;
  capabilities(): AdapterCapabilities;
  /** Filtros del símbolo (tickSize/stepSize/minNotional) para conformar órdenes con exactitud. */
  filters(symbol: string): Promise<ExchangeFilters>;
  getOrderBook(symbol: string): Promise<OrderBook>;
  getBalances(): Promise<Balance[]>;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  cancelOrder(symbol: string, orderId: string): Promise<OrderResult>;
}
