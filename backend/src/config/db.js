'use strict';
const mongoose = require('mongoose');
const RateLimit = require('../models/RateLimit');

mongoose.set('bufferCommands', false);

const STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
const getState = () => STATES[mongoose.connection.readyState] || 'unknown';

let reconnectTimer = null;
let savedUri = null;

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (mongoose.connection.readyState === 0 && savedUri) {
      console.log('Attempting to reconnect to MongoDB...');
      try {
        await mongoose.connect(savedUri, { serverSelectionTimeoutMS: 3000 });
      } catch (err) {
        console.error(`MongoDB reconnection attempt failed (${err.message}). Retrying in 5s...`);
        scheduleReconnect();
      }
    }
  }, 5000);
}
mongoose.connection.on('connected', async () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  console.log(`MongoDB connected: ${mongoose.connection.name}.${RateLimit.collection.name}`);
  try {
    await RateLimit.createIndexes();
  } catch (err) {
    console.error('Error ensuring indexes:', err.message);
  }
});
mongoose.connection.on('error', (err) => {
  console.error(`MongoDB connection error: ${err.message}`);
});
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Retrying connection in 5s...');
  scheduleReconnect();
});
async function connect(uri) {
  savedUri = uri;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
  } catch (err) {
    console.error(`MongoDB initial connection failed (${err.message}). Retrying in 5s...`);
    scheduleReconnect();
  }
}
module.exports = { connect, getState };
