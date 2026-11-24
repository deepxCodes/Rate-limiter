'use strict';
const mongoose = require('mongoose');

const rateLimitSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },
    windowStart: { type: Date, required: true },
    requestCount: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'rateLimits', versionKey: false, autoIndex: false }
);
rateLimitSchema.index({ clientId: 1, windowStart: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateLimit', rateLimitSchema);
