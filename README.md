# BDAG Price Feed

A tiny local dashboard for watching the BlockDAG (BDAG) CoinMarketCap price page.

The server scrapes CoinMarketCap's public BDAG page every 30 seconds, keeps a short in-memory price history, exposes the latest state at `/api/price`, and serves the dashboard from `public/index.html`.

> This is an unofficial scraper. CoinMarketCap can change its page shape at any time, so parser tests use a minimal synthetic fixture to catch obvious breakage before deployment.

## Requirements

- Node.js 20+

## Run locally

```bash
npm start
```

Then open <http://127.0.0.1:8192>.

Override the port when needed:

```bash
PORT=9000 npm start
```

## Verification

```bash
npm run check
npm test
```

`npm test` uses Node's built-in test runner and does not require external packages or secrets.
