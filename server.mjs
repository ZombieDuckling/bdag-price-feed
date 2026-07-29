import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBdagPriceFromCMC } from './lib/cmc.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const DEFAULT_PORT = 8192;
const MAX_POINTS = 240; // ~2h at 30s intervals

function resolvePublicPath(urlPathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPathname);
  } catch {
    return { errorStatus: 400, errorMessage: 'Bad request' };
  }

  const requestedPath = decodedPath === '/'
    ? path.join(publicDir, 'index.html')
    : path.resolve(publicDir, `.${decodedPath}`);

  const safePath = path.resolve(requestedPath);
  const insidePublic = safePath === publicDir || safePath.startsWith(`${publicDir}${path.sep}`);
  if (!insidePublic) {
    return { errorStatus: 403, errorMessage: 'Forbidden' };
  }

  return { safePath };
}

export function createBdagPriceFeedServer({ fetcher = fetchBdagPriceFromCMC } = {}) {
  const history = [];
  let lastSnapshot = null;
  let lastError = null;

  async function refreshPrice() {
    try {
      const snap = await fetcher();
      lastSnapshot = snap;
      lastError = null;
      history.push({ t: snap.timestamp, p: snap.price });
      if (history.length > MAX_POINTS) history.shift();
      console.log(`[${new Date().toISOString()}] BDAG $${snap.price.toFixed(6)}`);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[${new Date().toISOString()}] refresh failed:`, lastError);
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === '/api/price') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: !!lastSnapshot, snapshot: lastSnapshot, history, error: lastError }, null, 2));
        return;
      }

      const resolved = resolvePublicPath(url.pathname);
      if (resolved.errorStatus) {
        res.statusCode = resolved.errorStatus;
        res.end(resolved.errorMessage);
        return;
      }

      const ext = path.extname(resolved.safePath);
      const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
      }[ext] || 'text/plain; charset=utf-8';

      try {
        const data = await fs.readFile(resolved.safePath);
        res.setHeader('Content-Type', contentType);
        res.end(data);
      } catch (err) {
        if (err?.code === 'ENOENT' || err?.code === 'EISDIR') {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        throw err;
      }
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    }
  });

  return { server, refreshPrice, getState: () => ({ lastSnapshot, lastError, history }) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const { server, refreshPrice } = createBdagPriceFeedServer();

  setInterval(refreshPrice, 30_000);
  await refreshPrice();

  server.listen(port, '0.0.0.0', () => {
    console.log(`BDAG visual price feed live on http://127.0.0.1:${port}`);
  });
}
