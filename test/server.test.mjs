import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { createServer } from 'node:net';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 10_000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }

    try {
      const res = await fetch(baseUrl);
      await res.arrayBuffer();
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  throw new Error(`server did not start: ${lastError?.message || 'timeout'}`);
}

async function rawGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves dashboard, API status, and rejects encoded traversal', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = [];
  child.stdout.on('data', chunk => output.push(chunk.toString()));
  child.stderr.on('data', chunk => output.push(chunk.toString()));

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl, child);

    const dashboard = await fetch(`${baseUrl}/`);
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.headers.get('content-type') || '', /text\/html/);
    assert.match(await dashboard.text(), /BDAG Price Feed/);

    const api = await fetch(`${baseUrl}/api/price`);
    assert.equal(api.status, 200);
    assert.match(api.headers.get('content-type') || '', /application\/json/);
    const payload = await api.json();
    assert.equal(typeof payload.ok, 'boolean');
    assert.ok(Object.hasOwn(payload, 'snapshot'));
    assert.ok(Array.isArray(payload.history));
    assert.ok(Object.hasOwn(payload, 'error'));

    const missing = await fetch(`${baseUrl}/server.mjs`);
    const missingBody = await missing.text();
    assert.equal(missing.status, 404);
    assert.doesNotMatch(missingBody, /private\/tmp|ENOENT|fetchBdagPriceFromCMC/);

    const traversal = await rawGet(port, '/%2e%2e/server.mjs');
    assert.ok([403, 404].includes(traversal.statusCode), `unexpected traversal status ${traversal.statusCode}`);
    assert.doesNotMatch(traversal.body, /fetchBdagPriceFromCMC|createServer/);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      once(child, 'exit'),
      new Promise(resolve => setTimeout(resolve, 2_000)),
    ]);

    if (child.exitCode && child.exitCode !== 0) {
      throw new Error(`server exited with ${child.exitCode}: ${output.join('')}`);
    }
  }
});
