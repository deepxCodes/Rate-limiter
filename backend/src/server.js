'use strict';
const config = require('./config');
const { connect } = require('./config/db');
const store = require('./services/fixedWindowStore');
const { createApp } = require('./app');

createApp({ config, store }).listen(config.port, () => {
  console.log(`API on http://localhost:${config.port}  (${config.maxRequests} requests / ${config.windowMs / 1000}s per IP)`);
});
connect(config.mongoUri);
