// lib/core/markov.ts — Modelo de RÉGIMEN del premio (cadena de Markov de 1er orden).
// NO predice precios: estima cómo transita el premio Bitso entre estados (régimen), a partir
// del historial real. Es arbitraje estadístico de libro, fuera del hot-path. TS puro + testeable.

/** Estados de régimen del premio (en bps). Ordenados de menor a mayor. */
export type RegimeState = 'descuento' | 'neutral' | 'premio_bajo' | 'premio_alto';

export const REGIME_STATES: RegimeState[] = ['descuento', 'neutral', 'premio_bajo', 'premio_alto'];

export const REGIME_LABELS: Record<RegimeState, string> = {
  descuento: 'Descuento',
  neutral: 'Neutral',
  premio_bajo: 'Premio bajo',
  premio_alto: 'Premio alto',
};

/**
 * Clasifica un premio (bps) en un estado de régimen.
 * Umbrales por defecto pensados para el premio Bitso (rango típico ~ -16..+27 bps).
 */
export function classifyRegime(premiumBps: number, lowThresh = -3, neutralTop = 5, highThresh = 15): RegimeState {
  if (premiumBps < lowThresh) return 'descuento';
  if (premiumBps < neutralTop) return 'neutral';
  if (premiumBps < highThresh) return 'premio_bajo';
  return 'premio_alto';
}

export interface MarkovModel {
  /** matrix[i][j] = P(estado_j en t+1 | estado_i en t). Filas suman 1 (o 0 si el estado nunca se vio). */
  matrix: number[][];
  /** counts[i][j] = nº de transiciones observadas i->j. */
  counts: number[][];
  /** veces que se observó cada estado como origen. */
  totals: number[];
  /** distribución estacionaria (frecuencia de cada estado en la muestra). */
  stationary: number[];
  samples: number; // nº de muestras usadas
  transitions: number; // nº de transiciones (samples - 1)
}

/**
 * Estima la matriz de transición de 1er orden a partir de una serie de premios (bps).
 * Suavizado de Laplace opcional (alpha) para evitar ceros duros con poca data.
 */
export function buildMarkovModel(premiumsBps: number[], alpha = 0): MarkovModel {
  const N = REGIME_STATES.length;
  const counts: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  const freq = Array(N).fill(0);

  const states = premiumsBps.map((p) => REGIME_STATES.indexOf(classifyRegime(p)));
  for (const s of states) if (s >= 0) freq[s]++;

  for (let k = 0; k < states.length - 1; k++) {
    const i = states[k];
    const j = states[k + 1];
    if (i >= 0 && j >= 0) counts[i][j]++;
  }

  const totals = counts.map((row) => row.reduce((a, b) => a + b, 0));
  const matrix = counts.map((row, i) => {
    const denom = totals[i] + alpha * N;
    if (denom === 0) return Array(N).fill(0);
    return row.map((c) => (c + alpha) / denom);
  });

  const totalFreq = freq.reduce((a, b) => a + b, 0) || 1;
  const stationary = freq.map((f) => f / totalFreq);

  return {
    matrix,
    counts,
    totals,
    stationary,
    samples: states.length,
    transitions: Math.max(0, states.length - 1),
  };
}

/** Distribución del próximo estado dado el estado actual (fila de la matriz). */
export function nextStateDistribution(model: MarkovModel, current: RegimeState): number[] {
  const i = REGIME_STATES.indexOf(current);
  if (i < 0) return Array(REGIME_STATES.length).fill(0);
  return model.matrix[i];
}

/** Probabilidad de estar en régimen de premio (bajo o alto) en el próximo paso. */
export function probEntersPremium(model: MarkovModel, current: RegimeState): number {
  const dist = nextStateDistribution(model, current);
  return dist[REGIME_STATES.indexOf('premio_bajo')] + dist[REGIME_STATES.indexOf('premio_alto')];
}
