import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCmcHtml } from '../lib/cmc.mjs';

test('parseCmcHtml extracts BDAG market snapshot fields', async () => {
  const html = await readFile(new URL('./fixtures/cmc-page.html', import.meta.url), 'utf8');
  const snapshot = parseCmcHtml(html);

  assert.equal(snapshot.source, 'CoinMarketCap');
  assert.equal(snapshot.symbol, 'BDAG');
  assert.equal(snapshot.price, 0.0425);
  assert.equal(snapshot.marketCap, 425000000);
  assert.equal(snapshot.fullyDilutedMarketCap, 850000000);
  assert.equal(snapshot.volume24h, 1234567);
  assert.equal(snapshot.percentChange24h, 5.25);
  assert.match(snapshot.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('parseCmcHtml fails when the CMC payload is absent', () => {
  assert.throws(() => parseCmcHtml('<html></html>'), /__NEXT_DATA__/);
});

test('parseCmcHtml fails when price is missing or invalid', () => {
  const html = '<script id="__NEXT_DATA__">{"props":{"pageProps":{"detailRes":{"detail":{"statistics":{"price":"nope"}}}}}}</script>';
  assert.throws(() => parseCmcHtml(html), /Price field missing\/invalid/);
});
