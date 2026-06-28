// worker/execution/liveAdapter.ts — Implementación LIVE contra Binance Spot Testnet.
// Misma interfaz ExchangeAdapter que el simulado → demuestra que el salto a real es un adapter.
// REST firmado HMAC-SHA256 con `crypto` nativo + `fetch` (sin dependencias nuevas). OPT-IN: solo se
// usa si EXECUTION_MODE=live y hay keys de testnet; nunca toca el hot-path ni fondos reales.
import { createHmac } from 'node:crypto';
import type { AdapterCapabilities, Balance, ExchangeAdapter } from './adapter';
import { canTransition, OrderLifecycle, type OrderFill, type OrderRequest, type OrderResult, type OrderState } from './order';
import type { ExchangeFilters, OrderBook, Quote, Venue } from '../core';

const BASE = process.env.BINANCE_TESTNET_BASE_URL || 'https://testnet.binance.vision';

interface BinanceFill {
  price: string;
  qty: string;
  commission: string;
}
interface BinanceOrder {
  orderId: number;
  status: string;
  executedQty: string;
  fills?: BinanceFill[];
}

// Binance status → estado de nuestra FSM.
const STATUS_MAP: Record<string, OrderState> = {
  NEW: 'SENT',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  CANCELED: 'CANCELED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
};

export class LiveAdapter implements ExchangeAdapter {
  constructor(
    readonly venue: Venue,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  capabilities(): AdapterCapabilities {
    return { mode: 'live', supportsCancel: true, supportsMaker: true, crossVenueTransfer: false, symbols: ['BTCUSDT'] };
  }

  private signedQuery(params: Record<string, string | number>): string {
    const qs = new URLSearchParams(
      Object.entries({ ...params, timestamp: Date.now(), recvWindow: 5000 }).map(([k, v]) => [k, String(v)]),
    ).toString();
    const sig = createHmac('sha256', this.apiSecret).update(qs).digest('hex');
    return `${qs}&signature=${sig}`;
  }

  private async signed<T>(method: string, path: string, params: Record<string, string | number>): Promise<T> {
    const res = await fetch(`${BASE}${path}?${this.signedQuery(params)}`, {
      method,
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
    return json as T;
  }

  private async pub<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`);
    const json = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
    return json as T;
  }

  async filters(symbol: string): Promise<ExchangeFilters> {
    const info = await this.pub<{ symbols: Array<{ filters: Array<Record<string, string>> }> }>('/api/v3/exchangeInfo', { symbol });
    const f = info.symbols[0]?.filters ?? [];
    const price = f.find((x) => x.filterType === 'PRICE_FILTER');
    const lot = f.find((x) => x.filterType === 'LOT_SIZE');
    const notional = f.find((x) => x.filterType === 'NOTIONAL' || x.filterType === 'MIN_NOTIONAL');
    return {
      tickSize: Number(price?.tickSize ?? 0.01),
      stepSize: Number(lot?.stepSize ?? 0.00001),
      minQty: Number(lot?.minQty ?? 0),
      minNotional: Number(notional?.minNotional ?? notional?.notional ?? 5),
    };
  }

  async getOrderBook(symbol: string): Promise<OrderBook> {
    const d = await this.pub<{ bids: [string, string][]; asks: [string, string][] }>('/api/v3/depth', { symbol, limit: 20 });
    const lv = (a: [string, string][]) => a.map(([p, s]) => ({ price: +p, size: +s }));
    const quote: Quote = symbol.endsWith('USDT') ? 'USDT' : 'USD';
    return {
      venue: this.venue,
      base: 'BTC',
      quote,
      pair: `BTC/${quote}`,
      bids: lv(d.bids),
      asks: lv(d.asks),
      exchangeTs: 0,
      recvTs: Date.now(),
    };
  }

  async getBalances(): Promise<Balance[]> {
    const acc = await this.signed<{ balances: Array<{ asset: string; free: string; locked: string }> }>('GET', '/api/v3/account', {});
    return acc.balances.map((b) => ({ asset: b.asset, free: +b.free, locked: +b.locked })).filter((b) => b.free > 0 || b.locked > 0);
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const lc = new OrderLifecycle();
    try {
      const params: Record<string, string | number> = {
        symbol: req.symbol,
        side: req.side.toUpperCase(),
        type: req.type.toUpperCase(),
        quantity: req.qty,
      };
      if (req.type === 'limit') {
        params.price = req.limitPrice ?? 0;
        params.timeInForce = 'GTC';
      }
      lc.to('SENT');
      const o = await this.signed<BinanceOrder>('POST', '/api/v3/order', params);
      return this.toResult(lc, o);
    } catch (e) {
      lc.to('REJECTED', (e as Error).message);
      return { state: lc.state, filledQty: 0, avgPrice: 0, feeQuote: 0, fills: [], events: lc.events, rejectReason: (e as Error).message };
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<OrderResult> {
    const lc = new OrderLifecycle();
    lc.to('SENT');
    try {
      await this.signed('DELETE', '/api/v3/order', { symbol, orderId });
    } catch {
      /* puede que ya se haya llenado/expirado */
    }
    lc.to('CANCELED');
    return { state: lc.state, filledQty: 0, avgPrice: 0, feeQuote: 0, fills: [], events: lc.events };
  }

  private toResult(lc: OrderLifecycle, o: BinanceOrder): OrderResult {
    const fills: OrderFill[] = (o.fills ?? []).map((f) => ({ qty: +f.qty, price: +f.price, feeQuote: +f.commission }));
    const filledQty = +o.executedQty;
    const avgPrice = filledQty > 0 ? fills.reduce((s, f) => s + f.price * f.qty, 0) / filledQty : 0;
    const feeQuote = fills.reduce((s, f) => s + f.feeQuote, 0);
    const target = STATUS_MAP[o.status] ?? 'SENT';
    if (target !== lc.state && canTransition(lc.state, target)) lc.to(target);
    return { orderId: String(o.orderId), state: lc.state, filledQty, avgPrice, feeQuote, fills, events: lc.events };
  }
}
