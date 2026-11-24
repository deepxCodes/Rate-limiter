'use strict';
const path = require('node:path');
const express = require('express');
const { createRateLimiter } = require('./middleware/rateLimiter');
const { createApiRouter } = require('./routes/api');

function createApp({ config, store }) {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  if (config.corsOrigin) {
    app.use((req, res, next) => {
        res.set({
            'Access-Control-Allow-Origin': config.corsOrigin,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, ngrok-skip-browser-warning',
            'Access-Control-Expose-Headers':
                'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After',
        });

        if (req.method === 'OPTIONS') {
            return res.sendStatus(204);
        }

        next();
    });
}

  const rateLimiter = createRateLimiter({
    store,
    max: config.maxRequests,
    windowMs: config.windowMs,
    retentionMs: config.retentionMs,
  });

  app.use('/api', createApiRouter({ config, store, rateLimiter }));
  app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Not Found' }));
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  });
  return app;
}
module.exports = { createApp };
