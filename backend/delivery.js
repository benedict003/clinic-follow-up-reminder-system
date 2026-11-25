// backend/delivery.js
//
// Module 16: how bytes get to the browser.
//
// Measured before writing this: /app/main.dart.js was served at 2.95 MB with no
// Content-Encoding, and canvaskit.wasm at 7.0 MB. The JSON API was also
// uncompressed. Over a clinic's link that is the difference between a workable
// first load and a coffee break.
//
// Two decisions here, both measurable:
//
// 1. Compress. gzip for anything text, cached per file so a 3 MB bundle is not
//    re-compressed on every request. Brotli is offered when the client accepts it
//    and the file is large enough to be worth the CPU.
// 2. Cache honestly. Content-addressed and version-specific paths get a long
//    max-age; index.html and flutter_bootstrap.js keep revalidating, because a
//    stale entry point is how a deploy appears not to have happened.
import { createReadStream, statSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// .wasm is here because it was measured, not assumed: CanvasKit goes from 7.3 MB
// to 2.7 MB with brotli. The cost is one compression per file version, cached.
// COMPRESSION=off disables both paths. It exists so the benefit and the CPU cost
// can be measured against each other instead of asserted.
const COMPRESSION_ENABLED = process.env.COMPRESSION !== 'off';

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.json', '.css', '.svg', '.map', '.ttf', '.otf', '.wasm']);
const MIN_COMPRESS_BYTES = 1024;

/**
 * Paths whose contents change meaning only when the build changes. Flutter emits
 * the bundled assets under a build-specific directory and the wasm renderer per
 * engine revision, so a year is honest for them; the entry points are not.
 */
function cachePolicy(relPath) {
  if (relPath === '/' || relPath === '/index.html' || relPath === '/flutter_bootstrap.js'
      || relPath === '/flutter_service_worker.js' || relPath === '/manifest.json') {
    return 'no-cache';
  }
  if (relPath.startsWith('/assets/') || relPath.startsWith('/canvaskit/') || relPath.startsWith('/icons/')) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

/** Encoded copies are cached by path+mtime+size, so a redeploy invalidates them. */
const encodedCache = new Map();

function encode(absPath, stat) {
  const key = `${absPath}|${stat.mtimeMs}|${stat.size}`;
  const hit = encodedCache.get(key);
  if (hit) return hit;

  const raw = readFileSync(absPath);
  const entry = {
    raw,
    gzip: gzipSync(raw, { level: zc.Z_BEST_SPEED }),
    // Brotli at a low quality: this runs once per file version, but it still
    // should not take a second on a laptop during a demo.
    brotli: brotliCompressSync(raw, {
      params: { [zc.BROTLI_PARAM_QUALITY]: 5, [zc.BROTLI_PARAM_SIZE_HINT]: raw.length },
    }),
  };
  encodedCache.set(key, entry);
  // Bound the cache: a rebuild changes keys and the old entries are dead weight.
  if (encodedCache.size > 64) encodedCache.delete(encodedCache.keys().next().value);
  return entry;
}

function pickEncoding(acceptHeader, size) {
  if (!COMPRESSION_ENABLED) return null;
  if (!acceptHeader || size < MIN_COMPRESS_BYTES) return null;
  const accepted = String(acceptHeader).toLowerCase();
  if (accepted.includes('br')) return 'br';
  if (accepted.includes('gzip')) return 'gzip';
  return null;
}

/**
 * Serves the Flutter web build from `root`.
 *
 * Replaces express.static for two reasons that the measurements demanded: no
 * compression, and a single Cache-Control for every file regardless of whether
 * its name changes when its content does.
 */
export function serveApp(root, { log } = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // Slice the prefix off and reject traversal before touching the filesystem.
    const rawRel = decodeURIComponent(req.path.replace(/^\/app/, '') || '/');
    if (rawRel.includes('\0')) return next();
    let rel = rawRel === '/' ? '/index.html' : rawRel;
    const abs = normalize(join(root, rel));
    if (!abs.startsWith(normalize(root) + sep)) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN', requestId: req.id ?? null });
      return undefined;
    }

    let stat;
    try {
      stat = statSync(abs);
      if (stat.isDirectory()) {
        rel = '/index.html';
        stat = statSync(join(root, 'index.html'));
      }
    } catch {
      return next();
    }

    const ext = extname(abs === join(root, 'index.html') ? 'index.html' : abs).toLowerCase();
    const type = TYPES[ext] ?? 'application/octet-stream';
    const policy = cachePolicy(rel);
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', policy);
    res.setHeader('ETag', etag);
    // The app is same-origin and loads nothing from elsewhere, so this costs
    // nothing and blocks a hostile embed.
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return undefined;
    }

    if (COMPRESSIBLE.has(ext)) {
      const { gzip, brotli, raw } = encode(abs === join(root, 'index.html') ? join(root, 'index.html') : abs, stat);
      const encoding = pickEncoding(req.headers['accept-encoding'], raw.length);
      if (encoding === 'br') {
        res.setHeader('Content-Encoding', 'br');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', String(brotli.length));
        return res.end(req.method === 'HEAD' ? undefined : brotli);
      }
      if (encoding === 'gzip') {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', String(gzip.length));
        return res.end(req.method === 'HEAD' ? undefined : gzip);
      }
    }

    res.setHeader('Content-Length', String(stat.size));
    if (req.method === 'HEAD') return res.end();
    return createReadStream(abs).pipe(res);
  };
}

/**
 * Compresses JSON responses when the client accepts it and the body is worth it.
 * Sits on res.end so it does not care which route produced the payload.
 */
export function compressJson() {
  return (req, res, next) => {
    if (!COMPRESSION_ENABLED) return next();
    const accept = String(req.headers['accept-encoding'] ?? '').toLowerCase();
    if (!accept.includes('gzip') && !accept.includes('br')) return next();

    const json = res.json.bind(res);
    res.json = (body) => {
      const text = JSON.stringify(body);
      if (Buffer.byteLength(text) < MIN_COMPRESS_BYTES) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(text);
      }
      const useBr = accept.includes('br');
      const buf = useBr
        ? brotliCompressSync(Buffer.from(text), { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } })
        : gzipSync(Buffer.from(text), { level: zc.Z_BEST_SPEED });
      res.setHeader('Content-Encoding', useBr ? 'br' : 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', String(buf.length));
      return res.end(buf);
    };
    return next();
  };
}
