'use strict';
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const RateLimit = require('../src/models/RateLimit');
const store = require('../src/services/fixedWindowStore');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rateLimiterDB';

test('MongoDB concurrency integration test', async (t) => {
  let connected = false;
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await RateLimit.createIndexes();
    connected = true;
  } catch (err) {
    t.skip(`MongoDB is not reachable at ${MONGO_URI} (${err.message}). Start MongoDB to run this integration test.`);
    return;
  }

  t.after(async () => {
    if (connected) {
      await RateLimit.deleteMany({ clientId: /^test-concurrent-/ });
      await mongoose.disconnect();
    }
  });

  await t.test('handles simultaneous requests atomically and never exceeds max limit', async () => {
    const clientId = `test-concurrent-${Date.now()}`;
    const windowMs = 60000;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const expiresAt = new Date(windowStart.getTime() + windowMs + 86400000);
    const max = 5;
    const totalRequests = 20;

    await RateLimit.deleteOne({ clientId, windowStart });

    const promises = Array.from({ length: totalRequests }, () =>
      store.consume({ clientId, windowStart, expiresAt, max })
    );

    const results = await Promise.all(promises);

    const allowed = results.filter((r) => r.allowed === true);
    const blocked = results.filter((r) => r.allowed === false);

    assert.strictEqual(
      allowed.length,
      max,
      `Expected exactly ${max} requests to be allowed, but ${allowed.length} passed`
    );
    assert.strictEqual(
      blocked.length,
      totalRequests - max,
      `Expected exactly ${totalRequests - max} requests to be blocked, but ${blocked.length} blocked`
    );

    const doc = await RateLimit.findOne({ clientId, windowStart }).lean();
    assert.ok(doc, 'MongoDB document must be created');
    assert.strictEqual(
      doc.requestCount,
      max,
      `MongoDB requestCount must be exactly ${max}, but found ${doc.requestCount}`
    );

    const subsequent = await store.consume({ clientId, windowStart, expiresAt, max });
    assert.strictEqual(subsequent.allowed, false, 'Subsequent request must be rejected');

    const docAfter = await RateLimit.findOne({ clientId, windowStart }).lean();
    assert.strictEqual(
      docAfter.requestCount,
      max,
      'MongoDB requestCount must remain unchanged when requests are rejected'
    );
  });
});
