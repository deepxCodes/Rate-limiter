'use strict';
function getWindow(nowMs, windowMs) {
  const start = Math.floor(nowMs / windowMs) * windowMs;
  return { start, end: start + windowMs };
}
module.exports = { getWindow };
