'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createRateLimiter } = require('../src/middleware/rateLimiter');

function fakeStore() {
  const counts = new Map();
  return {
    async consume({ clientId, windowStart, max }) {
      const key = `${clientId}|${windowStart.getTime()}`;
      const c = counts.get(key) || 0;
      if (c < max) { counts.set(key, c + 1); return { allowed: true, count: c + 1 }; }
      return { allowed: false, count: max };
    },
  };
}

function call(mw, ip) {
  return new Promise((resolve) => {
    const res = {
      headers: {}, code: 200,
      set(a, b) { typeof a === 'string' ? (this.headers[a] = b) : Object.assign(this.headers, a); return this; },
      status(c) { this.code = c; return this; },
      json(body) { resolve({ code: this.code, headers: this.headers, body }); },
    };
    mw({ ip }, res, () => resolve({ code: 200, headers: res.headers, passed: true }));
  });
}

const setup = (overrides = {}) => {
  let t = 1_699_999_990_000; 
  const mw = createRateLimiter({ store: fakeStore(), max: 5, windowMs: 60_000, retentionMs: 86_400_000, now: () => t, ...overrides });
  return { mw, advance: (ms) => (t += ms) };
};

test('first 5 requests pass, 6th is 429 with Retry-After', async () => {
  const { mw } = setup();
  for (let i = 1; i <= 5; i++) {
    const r = await call(mw, '1.1.1.1');
    assert.ok(r.passed);
    assert.strictEqual(r.headers['RateLimit-Remaining'], 5 - i);
    assert.strictEqual(r.headers['Retry-After'], undefined);
  }
  const blocked = await call(mw, '1.1.1.1');
  assert.strictEqual(blocked.code, 429);
  assert.strictEqual(blocked.body.remaining, 0);
  assert.strictEqual(blocked.body.success, false);
  assert.ok(blocked.headers['Retry-After'] > 0);
});

test('blocked requests do not change the remaining count', async () => {
  const { mw } = setup();
  for (let i = 0; i < 5; i++) await call(mw, 'a');
  for (let i = 0; i < 3; i++) assert.strictEqual((await call(mw, 'a')).body.remaining, 0);
});

test('limit resets in the next window', async () => {
  const { mw, advance } = setup();
  for (let i = 0; i < 6; i++) await call(mw, 'a');
  advance(60_000);
  assert.ok((await call(mw, 'a')).passed);
});

test('RateLimit-Reset counts down to the window end', async () => {
  const { mw } = setup();
  assert.strictEqual((await call(mw, 'a')).headers['RateLimit-Reset'], 50);
});

test('clients are counted separately', async () => {
  const { mw } = setup();
  for (let i = 0; i < 6; i++) await call(mw, 'a');
  assert.ok((await call(mw, 'b')).passed);
});

test('store failure answers 503', async () => {
  const store = { consume: async () => { throw new Error('db down'); } };
  const { mw } = setup({ store });
  const r = await call(mw, 'a');
  assert.strictEqual(r.code, 503);
  assert.strictEqual(r.body.success, false);
});
