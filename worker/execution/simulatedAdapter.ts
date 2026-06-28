// worker/execution/simulatedAdapter.ts — Implementación SIMULADA de ExchangeAdapter (default).
// Fills contra el order book en RAM, conformando la orden a filtros (precision.ts) y aplicando el
// resultado al Ledger. Comparte la interfaz con el LiveAdapter → "sim == live".
import type { AdapterCapabilities, Balance, ExchangeAdapter } from './adapter';
import { OrderLifecycle, type OrderFill, type OrderRequest, type OrderResult } from './order';
import type { Ledger, MarketState } from '../state';
import {
  conformOrder,
  takerFee,
  walkVwap,
  type Asset,
  type ExchangeFilters,
  type FeeTable,
  type OrderBook,
  type Venue,
} from '../core';

// Filtros simulados estilo Binance BTC (en live se leen del exchange vía /exchangeInfo).
const SIM_FILTERS: ExchangeFilters = { tickSize: 0.01, stepSize: 0.00001, minNotional: 5, minQty: 0.00001 };

function symbolToPair(symbol: string): string {
  for (const base of ['BTC', 'ETH']) for (const quote of ['USDT', 'USD', 'MXN']) if (symbol === `${base}${quote}`) return `${base}/${quote}`;
  return symbol;
}
function quoteOf(pair: string): Asset {
  return (pair.split('/')[1] ?? 'USDT') as Asset;
}

export class SimulatedAdapter implements ExchangeAdapter {
  constructor(
    readonly venue: Venue,
    private readonly state: MarketState,
    private readonly ledger: Ledger,
    private readonly fees: () => FeeTable,
  ) {}

  capabilities(): AdapterCapabilities {
    return { mode: 'simulated', supportsCancel: true, supportsMaker: false, crossVenueTransfer: false, symbols: ['BTCUSDT'] };
  }

  async filters(): Promise<ExchangeFilters> {
    return SIM_FILTERS;
  }

  async getOrderBook(symbol: string): Promise<OrderBook> {
    const b = this.state.get(`${this.venue}:${symbolToPair(symbol)}`);
    if (!b) throw new Error(`sin libro para ${this.venue}:${symbol}`);
    return b;
  }

  async getBalances(): Promise<Balance[]> {
    return this.ledger
      .snapshot()
      .filter((w) => w.venue === this.venue)
      .map((w) => ({ asset: w.asset, free: w.balance, locked: 0 }));
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const lc = new OrderLifecycle();
    const reject = (reason: string): OrderResult => {
      lc.to('REJECTED', reason);
      return { state: lc.state, filledQty: 0, avgPrice: 0, feeQuote: 0, fills: [], events: lc.events, rejectReason: reason };
    };

    const pair = symbolToPair(req.symbol);
    const book = this.state.get(`${this.venue}:${pair}`);
    if (!book) return reject('no_book');
    lc.to('SENT');

    const refPrice = req.side === 'buy' ? book.asks[0]?.price ?? 0 : book.bids[0]?.price ?? 0;
    const conf = conformOrder(req.limitPrice ?? refPrice, req.qty, SIM_FILTERS);
    if (!conf.ok) return reject(conf.reason ?? 'filters');

    const levels = req.side === 'buy' ? book.asks : book.bids;
    const w = walkVwap(levels, conf.qty);
    if (!(w.filledBase > 0)) return reject('no_liquidity');

    const quote = quoteOf(pair);
    const notional = w.vwap * w.filledBase;
    const feeQuote = notional * takerFee(this.fees(), this.venue);
    if (req.side === 'buy') {
      this.ledger.add(this.venue, quote, -(notional + feeQuote));
      this.ledger.add(this.venue, 'BTC', w.filledBase);
    } else {
      this.ledger.add(this.venue, 'BTC', -w.filledBase);
      this.ledger.add(this.venue, quote, notional - feeQuote);
    }

    lc.to(w.fullyFilled ? 'FILLED' : 'PARTIALLY_FILLED');
    const fills: OrderFill[] = [{ qty: w.filledBase, price: w.vwap, feeQuote }];
    return {
      orderId: `sim-${this.venue}-${req.symbol}`,
      state: lc.state,
      filledQty: w.filledBase,
      avgPrice: w.vwap,
      feeQuote,
      fills,
      events: lc.events,
    };
  }

  async cancelOrder(): Promise<OrderResult> {
    const lc = new OrderLifecycle();
    lc.to('SENT');
    lc.to('CANCELED');
    return { state: lc.state, filledQty: 0, avgPrice: 0, feeQuote: 0, fills: [], events: lc.events };
  }
}
