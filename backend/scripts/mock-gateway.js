import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 4699);
let mode = 'ok';
let flakySeen = 0;
const seen = [];

const send = (res, code, body, headers = {}) => {
  try { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); }
  catch { /* client already aborted (expected for slow mode) */ }
};

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/_/mode') {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { mode = JSON.parse(raw).mode || 'ok'; } catch { mode = 'ok'; }
      flakySeen = 0;
      console.log(JSON.stringify({ src: 'mock', at: new Date().toISOString(), mode }));
      send(res, 200, { mode });
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/_/state') {
    return send(res, 200, { mode, calls: seen.length, recent: seen.slice(-20) });
  }
  if (req.method !== 'POST' || req.url !== '/notify') return send(res, 404, { error: 'Not found' });

  const correlationId = req.headers['x-correlation-id'] || '(none)';
  const idem = req.headers['idempotency-key'] || '(none)';
  const duplicate = seen.some(s => s.idem === idem && s.status === 200);

  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 65536) req.destroy(); });
  req.on('end', async () => {
    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
    const id = Number(body.followUpId);
    if (!Number.isInteger(id) || id < 1) return send(res, 422, { error: 'followUpId is required' });

    const entry = { at: new Date().toISOString(), correlationId, idem, followUpId: id, mode };
    seen.push(entry);

    if (duplicate) {
      console.log(JSON.stringify({ ...entry, status: 200, duplicate: true }));
      return send(res, 200, { accepted: true, duplicate: true });
    }
    if (mode === 'down') return req.destroy();
    if (mode === 'slow') {
      await new Promise(r => setTimeout(r, 10000));
      entry.status = 200; return send(res, 200, { accepted: true, slow: true });
    }
    if (mode === 'reject') {
      entry.status = 422;
      console.log(JSON.stringify(entry));
      return send(res, 422, { error: 'Reminder policy rejected this follow-up' });
    }
    if (mode === 'flaky') {
      flakySeen += 1;
      if (flakySeen <= 2) {
        entry.status = 503; console.log(JSON.stringify(entry));
        return send(res, 503, { error: 'Temporarily unavailable' }, { 'retry-after': '1' });
      }
    }
    entry.status = 200; console.log(JSON.stringify(entry));
    return send(res, 200, { accepted: true });
  });
}).listen(PORT, '127.0.0.1', () =>
  console.log(`mock gateway on http://127.0.0.1:${PORT}/notify (mode=ok)`));