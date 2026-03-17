import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const PORT = 8192;

const history = [];
const MAX_POINTS = 240; // ~2h at 30s intervals

async function fetchBdagPriceFromCMC() {
  const res = await fetch('https://coinmarketcap.com/currencies/blockdag/');
  if (!res.ok) throw new Error(`CMC HTTP ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find __NEXT_DATA__ payload on CoinMarketCap page');

  const json = JSON.parse(match[1]);
  const stats = json?.props?.pageProps?.detailRes?.detail?.statistics;
  const price = Number(stats?.price);

  if (!Number.isFinite(price)) {
    throw new Error('Price field missing/invalid in CMC payload');
  }

  return {
    source: 'CoinMarketCap',
    symbol: 'BDAG',
    price,
    marketCap: stats?.marketCap ?? null,
    fullyDilutedMarketCap: stats?.fullyDilutedMarketCap ?? null,
    volume24h: stats?.volume24h ?? null,
    percentChange24h: stats?.priceChangePercentage24h ?? null,
    timestamp: new Date().toISOString(),
  };
}

let lastSnapshot = null;
let lastError = null;

async function refreshPrice() {
  try {
    const snap = await fetchBdagPriceFromCMC();
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

setInterval(refreshPrice, 30_000);
await refreshPrice();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/price') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: !!lastSnapshot, snapshot: lastSnapshot, history, error: lastError }, null, 2));
      return;
    }

    const filePath = url.pathname === '/'
      ? path.join(publicDir, 'index.html')
      : path.join(publicDir, url.pathname.replace(/^\//, ''));

    const safePath = path.normalize(filePath);
    if (!safePath.startsWith(publicDir)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(safePath);
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
    }[ext] || 'text/plain; charset=utf-8';

    const data = await fs.readFile(safePath);
    res.setHeader('Content-Type', contentType);
    res.end(data);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BDAG visual price feed live on http://127.0.0.1:${PORT}`);
});
