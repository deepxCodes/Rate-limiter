'use strict';
const RateLimit = require('../models/RateLimit');
async function consume({ clientId, windowStart, expiresAt, max }) {
  try {
    await RateLimit.updateOne(
      { clientId, windowStart },
      { $setOnInsert: { requestCount: 0, expiresAt } },
      { upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  const doc = await RateLimit.findOneAndUpdate(
    { clientId, windowStart, requestCount: { $lt: max } },
    { $inc: { requestCount: 1 } },
    { new: true }
  ).lean();

  return doc ? { allowed: true, count: doc.requestCount } : { allowed: false, count: max };
}

async function getCount({ clientId, windowStart }) {
  const doc = await RateLimit.findOne({ clientId, windowStart }).lean();
  return doc ? doc.requestCount : 0;
}
module.exports = { consume, getCount };
