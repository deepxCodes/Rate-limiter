'use strict';
const { getWindow } = require('../utils/window');

function createRateLimiter({ store, max, windowMs, retentionMs, now = Date.now }) {
  return async function rateLimiter(req, res, next) {
    const t = now();
    const { start, end } = getWindow(t, windowMs);
    const resetSeconds = Math.ceil((end - t) / 1000);

    try {
      const { allowed, count } = await store.consume({
        clientId: req.ip,
        windowStart: new Date(start),
        expiresAt: new Date(end + retentionMs),
        max,
      });

      res.set({
        'RateLimit-Limit': max,
        'RateLimit-Remaining': Math.max(0, max - count),
        'RateLimit-Reset': resetSeconds,
      });

      if (!allowed) {
        res.set('Retry-After', resetSeconds);
        return res.status(429).json({
          success: false,
          message: 'Too many requests. Please try again later.',
          limit: max,
          remaining: 0,
          retryAfter: resetSeconds,
        });
      }
      return next();
    } catch (err) {
      console.error('Rate limiter store error:', err.message);
      return res.status(503).json({
        success: false,
        message: 'Rate limiter database is unavailable.',
      });
    }
  };
}
module.exports = { createRateLimiter };
