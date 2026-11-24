'use strict';
const base = process.env.BASE_URL || 'http://localhost:5000';
const total = Number(process.env.TOTAL) || 20;

(async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  const max = health.rateLimit.limit;
  const used = health.client ? health.client.used : 0;
  const res = await Promise.all(Array.from({ length: total }, () => fetch(`${base}/api/test`)));
  const tally = {};
  res.forEach((r) => { tally[r.status] = (tally[r.status] || 0) + 1; });
  console.log({ max, alreadyUsed: used, sent: total, tally });
  const allowed = tally[200] || 0;
  const expected = Math.max(0, max - used);
  console.log(allowed === expected ? 'PASS: exactly the remaining quota was served' : `FAIL: expected ${expected} x 200, got ${allowed}`);
  process.exit(allowed === expected ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
