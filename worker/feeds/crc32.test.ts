// worker/feeds/crc32.test.ts — Tests del CRC32 y los constructores de checksum.
// Correr: node --import tsx --test worker/feeds/crc32.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, toInt32, okxChecksumString, krakenFmt, krakenChecksumString } from './crc32';

test('CRC32 contra el vector estándar "123456789" = 0xCBF43926', () => {
  assert.equal(crc32('123456789'), 0xcbf43926);
  assert.equal(crc32('123456789'), 3421780262);
});

test('CRC32 de cadena vacía = 0', () => {
  assert.equal(crc32(''), 0);
});

test('toInt32 convierte unsigned -> signed (como OKX)', () => {
  assert.equal(toInt32(0xffffffff), -1);
  assert.equal(toInt32(0x80000000), -2147483648);
  assert.equal(toInt32(1), 1);
});

test('okxChecksumString alterna bid/ask con strings crudos', () => {
  const bids = [
    { px: '10', sz: '1' },
    { px: '9', sz: '2' },
  ];
  const asks = [{ px: '11', sz: '3' }];
  // i=0: bid 10:1, ask 11:3 ; i=1: bid 9:2 (ask agotado)
  assert.equal(okxChecksumString(bids, asks), '10:1:11:3:9:2');
});

test('krakenFmt quita el punto y los ceros a la izquierda', () => {
  assert.equal(krakenFmt(0.1, 8), '10000000');
  assert.equal(krakenFmt(45283.5, 1), '452835');
  assert.equal(krakenFmt(0, 2), '0');
});

test('krakenChecksumString concatena asks(asc) luego bids(desc)', () => {
  const asks = [{ price: 45285.0, qty: 0.5 }];
  const bids = [{ price: 45283.5, qty: 0.1 }];
  // asks: "452850"+"50000000"  bids: "452835"+"10000000"
  assert.equal(krakenChecksumString(asks, bids, 1, 8), '4528505000000045283510000000');
});
