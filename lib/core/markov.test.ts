// lib/core/markov.test.ts — Tests del modelo de régimen (cadena de Markov).
// Correr: node --import tsx --test lib/core/markov.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarkovModel,
  classifyRegime,
  nextStateDistribution,
  probEntersPremium,
  REGIME_STATES,
} from './markov';

test('classifyRegime mapea bps al estado correcto', () => {
  assert.equal(classifyRegime(-10), 'descuento');
  assert.equal(classifyRegime(0), 'neutral');
  assert.equal(classifyRegime(8), 'premio_bajo');
  assert.equal(classifyRegime(25), 'premio_alto');
  // bordes
  assert.equal(classifyRegime(-3), 'neutral'); // -3 no es < -3
  assert.equal(classifyRegime(5), 'premio_bajo'); // 5 no es < 5
  assert.equal(classifyRegime(15), 'premio_alto'); // 15 no es < 15
});

test('matriz de transición: las filas observadas suman 1', () => {
  // Serie que alterna neutral(0) <-> premio_alto(20)
  const serie = [0, 20, 0, 20, 0, 20];
  const m = buildMarkovModel(serie);
  for (let i = 0; i < REGIME_STATES.length; i++) {
    const rowSum = m.matrix[i].reduce((a, b) => a + b, 0);
    // fila suma 1 si el estado se vio como origen; 0 si nunca
    assert.ok(Math.abs(rowSum - 1) < 1e-9 || rowSum === 0, `fila ${i} suma ${rowSum}`);
  }
});

test('transiciones deterministas se capturan exactas', () => {
  // neutral SIEMPRE va a premio_alto, y premio_alto SIEMPRE a neutral
  const serie = [0, 20, 0, 20, 0]; // neutral,alto,neutral,alto,neutral
  const m = buildMarkovModel(serie);
  const iNeutral = REGIME_STATES.indexOf('neutral');
  const iAlto = REGIME_STATES.indexOf('premio_alto');
  // desde neutral -> premio_alto con prob 1
  assert.ok(Math.abs(m.matrix[iNeutral][iAlto] - 1) < 1e-9, 'neutral->alto debe ser 1');
  // desde premio_alto -> neutral con prob 1
  assert.ok(Math.abs(m.matrix[iAlto][iNeutral] - 1) < 1e-9, 'alto->neutral debe ser 1');
});

test('cuenta correcta de transiciones y muestras', () => {
  const serie = [0, 20, 0, 20]; // 4 muestras -> 3 transiciones
  const m = buildMarkovModel(serie);
  assert.equal(m.samples, 4);
  assert.equal(m.transitions, 3);
});

test('probEntersPremium suma las columnas de premio', () => {
  // neutral -> mitad premio_bajo, mitad premio_alto
  const serie = [0, 8, 0, 20]; // neutral->bajo, bajo->neutral, neutral->alto
  const m = buildMarkovModel(serie);
  // desde neutral hubo 2 salidas: una a premio_bajo, una a premio_alto -> prob premium = 1.0
  const p = probEntersPremium(m, 'neutral');
  assert.ok(Math.abs(p - 1) < 1e-9, `prob entra a premio desde neutral = ${p}, esperado 1`);
});

test('estado nunca visto devuelve distribución vacía (sin crash)', () => {
  const serie = [0, 0, 0]; // solo neutral
  const m = buildMarkovModel(serie);
  const dist = nextStateDistribution(m, 'premio_alto'); // nunca visto como origen
  assert.equal(dist.reduce((a, b) => a + b, 0), 0);
});

test('suavizado de Laplace evita ceros duros', () => {
  const serie = [0, 20, 0, 20, 0];
  const m = buildMarkovModel(serie, 1); // alpha=1
  // con suavizado, toda transición desde un estado visto tiene prob > 0
  const iNeutral = REGIME_STATES.indexOf('neutral');
  for (const p of m.matrix[iNeutral]) assert.ok(p > 0, 'con Laplace ninguna prob es 0');
});
