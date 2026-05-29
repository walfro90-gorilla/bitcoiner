// worker/state.ts — Estado de mercado en RAM (order books normalizados) + ledger de wallets.
import type { Asset, OrderBook, Venue, VenueKey } from './core';
import { venueKey } from './core';

export class MarketState {
  readonly books = new Map<VenueKey, OrderBook>();

  setBook(b: OrderBook): VenueKey {
    const k = venueKey(b.venue, b.pair);
    this.books.set(k, b);
    return k;
  }
  get(key: VenueKey): OrderBook | undefined {
    return this.books.get(key);
  }
  all(): OrderBook[] {
    return [...this.books.values()];
  }
  byPair(pair: string): OrderBook[] {
    return this.all().filter((b) => b.pair === pair);
  }
  byBase(base: Asset): OrderBook[] {
    return this.all().filter((b) => b.base === base);
  }
}

/** Ledger de balances simulados en RAM (espejo de la tabla wallets). */
export class Ledger {
  private bal = new Map<string, number>();

  private key(venue: Venue, asset: Asset): string {
    return `${venue}:${asset}`;
  }
  get(venue: Venue, asset: Asset): number {
    return this.bal.get(this.key(venue, asset)) ?? 0;
  }
  set(venue: Venue, asset: Asset, amount: number): void {
    this.bal.set(this.key(venue, asset), amount);
  }
  add(venue: Venue, asset: Asset, delta: number): number {
    const next = this.get(venue, asset) + delta;
    this.bal.set(this.key(venue, asset), next);
    return next;
  }
  snapshot(): Array<{ venue: Venue; asset: Asset; balance: number }> {
    return [...this.bal.entries()].map(([k, balance]) => {
      const [venue, asset] = k.split(':') as [Venue, Asset];
      return { venue, asset, balance };
    });
  }
}
