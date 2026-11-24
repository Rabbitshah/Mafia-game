import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameServer } from './server';

type Server = ReturnType<typeof createGameServer>;
const open: Server[] = [];

afterEach(async () => {
  for (const s of open.splice(0)) {
    await s.close();
    await new Promise((resolve) => s.httpServer.close(resolve));
  }
});

async function start(allowLan: boolean): Promise<number> {
  const server = createGameServer({ clientOrigin: 'http://localhost:5173', allowLan });
  open.push(server);
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  return (server.httpServer.address() as AddressInfo).port;
}

/** Returns the Access-Control-Allow-Origin header a browser at `origin` would get, and the status. */
function request(port: number, path: string, origin: string) {
  return new Promise<{ status: number; allowOrigin: string | undefined }>((resolve, reject) => {
    get({ host: '127.0.0.1', port, path, headers: { origin } }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, allowOrigin: res.headers['access-control-allow-origin'] as string | undefined });
    }).on('error', reject);
  });
}

const POLL = '/socket.io/?EIO=4&transport=polling';

describe('CORS origins', () => {
  it('production mode: only the configured origin is allowed', async () => {
    const port = await start(false);
    expect((await request(port, POLL, 'http://localhost:5173')).allowOrigin).toBe('http://localhost:5173');
    expect((await request(port, POLL, 'http://192.168.29.86:5173')).allowOrigin).toBeUndefined();
    expect((await request(port, POLL, 'https://evil.example.com')).allowOrigin).toBeUndefined();
  });

  it('production mode: /lan does not exist', async () => {
    const port = await start(false);
    expect((await request(port, '/lan', 'http://localhost:5173')).status).toBe(404);
  });

  it('LAN dev mode: allows private-network origins only', async () => {
    const port = await start(true);
    for (const ok of ['http://192.168.29.86:5173', 'http://10.0.0.5:5173', 'http://172.16.0.1:5173', 'http://172.31.255.1:5173']) {
      expect((await request(port, POLL, ok)).allowOrigin).toBe(ok);
    }
    for (const bad of [
      'https://evil.example.com',
      'http://172.32.0.1:5173', // just outside 172.16-31
      'http://8.8.8.8:5173',
      'http://192.168.1.1.evil.com', // lookalike host
    ]) {
      expect((await request(port, POLL, bad)).allowOrigin).toBeUndefined();
    }
  });

  it('LAN dev mode: /lan answers', async () => {
    const port = await start(true);
    expect((await request(port, '/lan', 'http://localhost:5173')).status).toBe(200);
  });
});
