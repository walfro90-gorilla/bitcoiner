// worker/leader.test.ts — Máquina de estados de la elección de líder (la atomicidad del lease
// vive en la función SQL acquire_lease; aquí probamos la lógica del cliente con un acquire falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LeaderElection } from './leader';

test('single: gana el lease de inmediato y dispara onChange una sola vez', async () => {
  const changes: boolean[] = [];
  const el = new LeaderElection('a', { acquire: async () => true, onChange: (l) => changes.push(l) });
  await el.tick();
  assert.equal(el.isLeader(), true);
  await el.tick(); // renovación idempotente: sigue líder, sin nuevo onChange
  assert.deepEqual(changes, [true]);
});

test('standby: no lidera mientras otro tiene el lease válido', async () => {
  const el = new LeaderElection('b', { acquire: async () => false });
  await el.tick();
  assert.equal(el.isLeader(), false);
});

test('takeover: toma el relevo cuando el lease queda libre (expira)', async () => {
  let free = false;
  const changes: boolean[] = [];
  const el = new LeaderElection('c', { acquire: async () => free, onChange: (l) => changes.push(l) });
  await el.tick();
  assert.equal(el.isLeader(), false);
  free = true;
  await el.tick();
  assert.equal(el.isLeader(), true);
  assert.deepEqual(changes, [true]);
});

test('blip de red: mantiene el liderazgo si acquire lanza (sin stepdown por error transitorio)', async () => {
  let mode: 'ok' | 'err' = 'ok';
  const el = new LeaderElection('d', {
    acquire: async () => {
      if (mode === 'err') throw new Error('net');
      return true;
    },
  });
  await el.tick();
  assert.equal(el.isLeader(), true);
  mode = 'err';
  await el.tick();
  assert.equal(el.isLeader(), true, 'sigue líder pese al error de red');
});

test('cede liderazgo si un acquire EXITOSO devuelve false (otro ganó el lease)', async () => {
  let won = true;
  const changes: boolean[] = [];
  const el = new LeaderElection('e', { acquire: async () => won, onChange: (l) => changes.push(l) });
  await el.tick();
  assert.equal(el.isLeader(), true);
  won = false;
  await el.tick();
  assert.equal(el.isLeader(), false);
  assert.deepEqual(changes, [true, false]);
});
