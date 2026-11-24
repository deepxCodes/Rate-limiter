'use strict';
const express = require('express');
const { getWindow } = require('../utils/window');
const { getState } = require('../config/db');
const RateLimit = require('../models/RateLimit');

function createApiRouter({ config, store, rateLimiter }) {
  const router = express.Router();
  router.get('/health', async (req, res) => {
    const dbState = getState();

    const body = {
      success: dbState === 'connected',
      message: 'Server is running',
      database: { state: dbState, name: RateLimit.db.name, collection: RateLimit.collection.name },
      rateLimit: { limit: config.maxRequests, windowMs: config.windowMs },
    };
    if (dbState === 'connected') {
      try {
        const now = Date.now();
        const { start, end } = getWindow(now, config.windowMs);
        body.serverTime = now;
        body.rateLimit.windowEnd = end;
        body.rateLimit.windowSeconds = config.windowMs / 1000;
        body.client = { used: await store.getCount({ clientId: req.ip, windowStart: new Date(start) }) };
      } catch (err) {
        body.database.state = 'error';
        body.success = false;
      }
    }
    res.status(body.success ? 200 : 503).json(body);
  });
  router.get('/test', rateLimiter, (req, res) => {
    res.json({ success: true, message: 'Request accepted successfully' });
  });

  return router;
}
module.exports = { createApiRouter };
