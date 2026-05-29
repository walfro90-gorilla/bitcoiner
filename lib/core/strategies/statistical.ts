// lib/core/strategies/statistical.ts — Arbitraje estadístico (z-score / mean-reversion).
// Trabaja sobre el log-ratio del mid entre dos venues; mantiene ventana rodante.

/** Estadística rodante O(1) por muestra (media + desviación con ventana fija). */
export class RollingZScore {
  private buf: number[] = [];
  private sum = 0;
  private sumSq = 0;
  constructor(public readonly window: number) {}

  push(x: number): void {
    this.buf.push(x);
    this.sum += x;
    this.sumSq += x * x;
    if (this.buf.length > this.window) {
      const old = this.buf.shift() as number;
      this.sum -= old;
      this.sumSq -= old * old;
    }
  }

  get count(): number {
    return this.buf.length;
  }
  get mean(): number {
    return this.count ? this.sum / this.count : 0;
  }
  get std(): number {
    if (this.count < 2) return 0;
    const m = this.mean;
    const v = Math.max(0, this.sumSq / this.count - m * m);
    return Math.sqrt(v);
  }
  z(x: number): number {
    const s = this.std;
    return s > 0 ? (x - this.mean) / s : 0;
  }
}

export type StatAction = 'enter_long_a' | 'enter_short_a' | 'exit' | 'none';

export interface StatSignal {
  pairA: string;
  pairB: string;
  midA: number;
  midB: number;
  spread: number; // log-ratio ln(midA/midB)
  z: number;
  mean: number;
  std: number;
  action: StatAction;
}

export interface StatThresholds {
  entry: number; // |z| >= entry para entrar (default 2)
  exit: number; // |z| <= exit para salir (default 0.5)
  stop: number; // |z| >= stop para stop-out (default 4)
}

export const DEFAULT_STAT_THRESHOLDS: StatThresholds = { entry: 2, exit: 0.5, stop: 4 };

/**
 * Calcula el z-score del spread actual respecto a la ventana PREVIA, luego agrega la muestra.
 * `enter_short_a` = A está caro (z>0): vender A, comprar B. `enter_long_a` = A barato.
 */
export function statSample(
  stats: RollingZScore,
  pairA: string,
  pairB: string,
  midA: number,
  midB: number,
  th: StatThresholds = DEFAULT_STAT_THRESHOLDS,
): StatSignal {
  const spread = Math.log(midA / midB);
  const ready = stats.count >= 2;
  const z = ready ? stats.z(spread) : 0;
  const mean = stats.mean;
  const std = stats.std;
  stats.push(spread); // actualizar después de medir z

  let action: StatAction = 'none';
  if (ready) {
    const az = Math.abs(z);
    if (az >= th.stop) action = 'exit';
    else if (az <= th.exit) action = 'exit';
    else if (z >= th.entry) action = 'enter_short_a';
    else if (z <= -th.entry) action = 'enter_long_a';
  }

  return { pairA, pairB, midA, midB, spread, z, mean, std, action };
}
