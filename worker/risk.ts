// worker/risk.ts — Circuit breakers y gestión de riesgo del bot.
import { RUNTIME } from './runtimeConfig';

export interface BotRuntimeState {
  tradingEnabled: boolean;
  demoMode: boolean;
  minNetBps: number;
  maxPositionUsd: number;
  cumulativePnlUsd: number;
  consecutiveLosses: number;
  newsRiskOff: boolean;
  newsSentiment: number;
  newsImpact: string;
}

export class RiskManager {
  private tradeTimestamps: number[] = [];
  private haltedUntil = 0;

  constructor(public state: BotRuntimeState) {}

  /** Motivo de bloqueo de ejecución, o null si se permite operar. */
  blockReason(now: number): string | null {
    if (!this.state.tradingEnabled) return 'trading_disabled';
    if (now < this.haltedUntil) return 'cooldown_consecutive_losses';
    const windowStart = now - 60_000;
    this.tradeTimestamps = this.tradeTimestamps.filter((t) => t >= windowStart);
    if (this.tradeTimestamps.length >= RUNTIME.maxTradesPerMin) return 'max_trades_per_min';
    return null;
  }

  /** Registra un trade ejecutado y actualiza P&L + breaker de pérdidas consecutivas. */
  recordTrade(now: number, netPnlUsd: number): void {
    this.tradeTimestamps.push(now);
    this.state.cumulativePnlUsd += netPnlUsd;
    if (netPnlUsd < 0) {
      this.state.consecutiveLosses += 1;
      if (this.state.consecutiveLosses >= RUNTIME.consecutiveLossHalt) {
        this.haltedUntil = now + RUNTIME.lossCooldownMs; // cooldown configurable tras N pérdidas seguidas
        this.state.consecutiveLosses = 0;
      }
    } else {
      this.state.consecutiveLosses = 0;
    }
  }

  isHalted(now: number): boolean {
    return now < this.haltedUntil;
  }
}
