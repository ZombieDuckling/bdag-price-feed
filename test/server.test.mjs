import assert from 'node:assert/strict';
import test from 'node:test';
import { createBdagPriceFeedServer } from '../server.mjs';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
}

test('server returns the dashboard and a populated API response after refresh', async () => {
  const app = createBdagPriceFeedServer({
    fetcher: async () => ({
      source: 'test',
      symbol: 'BDAG',
      price: 0.05,
      marketCap: null,
      fullyDilutedMarketCap: null,
      volume24h: null,
      percentChange24h: 1.5,
      timestamp: '2026-01-01T00:00:00.000Z',
    }),
  });
  await app.refreshPrice();
  const baseUrl = await listen(app.server);

  try {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /BDAG Price Feed/);

    const api = await fetch(`${baseUrl}/api/price`);
    assert.equal(api.status, 200);
    const json = await api.json();
    assert.equal(json.ok, true);
    assert.equal(json.snapshot.price, 0.05);
    assert.deepEqual(json.history, [{ t: '2026-01-01T00:00:00.000Z', p: 0.05 }]);
  } finally {
    await close(app.server);
  }
});

test('server reports fetch errors without failing the API route', async () => {
  const app = createBdagPriceFeedServer({
    fetcher: async () => {
      throw new Error('upstream unavailable');
    },
  });
  await app.refreshPrice();
  const baseUrl = await listen(app.server);

  try {
    const api = await fetch(`${baseUrl}/api/price`);
    assert.equal(api.status, 200);
    const json = await api.json();
    assert.equal(json.ok, false);
    assert.equal(json.snapshot, null);
    assert.equal(json.error, 'upstream unavailable');
  } finally {
    await close(app.server);
  }
});

test('server does not expose files outside public', async () => {
  const app = createBdagPriceFeedServer({ fetcher: async () => { throw new Error('unused'); } });
  const baseUrl = await listen(app.server);

  try {
    for (const suffix of ['/../server.mjs', '/..%2Fserver.mjs', '/%2e%2e/server.mjs']) {
      const res = await fetch(`${baseUrl}${suffix}`);
      assert.notEqual(res.status, 200, suffix);
      assert.doesNotMatch(await res.text(), /createBdagPriceFeedServer/, suffix);
    }
  } finally {
    await close(app.server);
  }
});
