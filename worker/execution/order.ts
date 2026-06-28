// worker/execution/order.ts — Máquina de estados del ciclo de vida de una orden.
// Núcleo de la arquitectura "real-ready": la simulación y el live (testnet) comparten ESTOS tipos,
// así el salto a ejecución real es cambiar el adapter, no rediseñar el motor.
import type { Venue } from '../core';

export type OrderState = 'NEW' | 'SENT' | 'PARTIALLY_FILLED' | 'FILLED' | 'REJECTED' | 'CANCELED' | 'EXPIRED';

/** Transiciones válidas. Los estados terminales no tienen salida. */
export const ORDER_TRANSITIONS: Record<OrderState, OrderState[]> = {
  NEW: ['SENT', 'REJECTED'],
  SENT: ['PARTIALLY_FILLED', 'FILLED', 'REJECTED', 'CANCELED', 'EXPIRED'],
  PARTIALLY_FILLED: ['PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'EXPIRED'],
  FILLED: [],
  REJECTED: [],
  CANCELED: [],
  EXPIRED: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isTerminal(s: OrderState): boolean {
  return ORDER_TRANSITIONS[s].length === 0;
}

export interface OrderRequest {
  venue: Venue;
  symbol: string; // formato del exchange, p.ej. "BTCUSDT"
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  qty: number; // cantidad en base (BTC)
  limitPrice?: number; // requerido para limit
}

export interface OrderFill {
  qty: number;
  price: number;
  feeQuote: number;
}

export interface OrderEvent {
  ts: number;
  from: OrderState | null;
  to: OrderState;
  reason?: string;
}

export interface OrderResult {
  orderId?: string;
  state: OrderState;
  filledQty: number;
  avgPrice: number;
  feeQuote: number;
  fills: OrderFill[];
  events: OrderEvent[];
  rejectReason?: string;
}

/** Acumulador de eventos del ciclo de vida (audit log de la orden). */
export class OrderLifecycle {
  state: OrderState = 'NEW';
  readonly events: OrderEvent[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {
    this.events.push({ ts: this.now(), from: null, to: 'NEW' });
  }

  /** Intenta transicionar; lanza si la transición es inválida (protege la FSM). */
  to(next: OrderState, reason?: string): void {
    if (!canTransition(this.state, next)) {
      throw new Error(`transición inválida ${this.state} -> ${next}`);
    }
    this.events.push({ ts: this.now(), from: this.state, to: next, reason });
    this.state = next;
  }
}
