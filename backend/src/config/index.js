'use strict';
require('dotenv').config();

function positiveInt(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
module.exports = {
  port: positiveInt('PORT', 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rateLimiterDB',
  maxRequests: positiveInt('RATE_LIMIT_MAX', 5),
  windowMs: positiveInt('RATE_LIMIT_WINDOW_MS', 60000),
  retentionMs: positiveInt('RATE_LIMIT_RETENTION_MS', 86400000),
  trustProxy: process.env.TRUST_PROXY === 'true',
  corsOrigin: process.env.CORS_ORIGIN || '',
};
