import { io as connect, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Creds, PlayerView } from '@mafia/shared';
import { createGameServer } from './server';

let server: ReturnType<typeof createGameServer>;
let url: string;
const sockets: Socket[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TC {
  socket: Socket;
  creds: Creds;
  last: () => PlayerView;
  kicked: () => boolean;
  emit: (e: string, p?: unknown) => Promise<{ ok: boolean; error?: string }>;
}

async function mk(code?: string, name = 'P0'): Promise<TC> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  let last!: PlayerView;
  let kicked = false;
  socket.on('state:snapshot', (v: PlayerView) => (last = v));
  socket.on('room:kicked', () => (kicked = true));
  await new Promise<void>((r) => socket.on('connect', () => r()));
  const emit: TC['emit'] = (e, p) => new Promise((res) => socket.emit(e, p, res));
  const r = await emit(code ? 'room:join' : 'room:create', code ? { code, name } : { name });
  return { socket, creds: r as unknown as Creds, last: () => last, kicked: () => kicked, emit };
}

beforeEach(async () => {
  server = createGameServer({ clientOrigin: 'http://localhost:5173', minPlayers: 5, lobbyGraceMs: 50 });
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await server.close();
  await new Promise((r) => server.httpServer.close(r));
});

async function lobby(n: number): Promise<TC[]> {
  const host = await mk();
  const ps = [host];
  for (let i = 1; i < n; i++) ps.push(await mk(host.creds.code, `P${i}`));
  await wait(60);
  return ps;
}

describe('host controls over the wire', () => {
  it('settings: host can change them and everyone sees it; others and bad values are rejected', async () => {
    const ps = await lobby(3);
    expect((await ps[0]!.emit('host:settings', { voteSec: 90, publicVotes: false })).ok).toBe(true);
    await wait(60);
    expect(ps[2]!.last().settings).toMatchObject({ voteSec: 90, publicVotes: false });
    expect((await ps[1]!.emit('host:settings', { voteSec: 60 })).error).toBe('NOT_HOST');
    expect((await ps[0]!.emit('host:settings', { voteSec: 1 })).error).toBe('BAD_SETTINGS');
  });

  it('kick: removes the player, tells them, and they can join again', async () => {
    const ps = await lobby(3);
    expect((await ps[1]!.emit('host:kick', { target: ps[2]!.creds.playerId })).error).toBe('NOT_HOST');
    expect((await ps[0]!.emit('host:kick', { target: ps[0]!.creds.playerId })).error).toBe('NO_SUCH_PLAYER');
    expect((await ps[0]!.emit('host:kick', { target: ps[2]!.creds.playerId })).ok).toBe(true);
    await wait(60);
    expect(ps[2]!.kicked()).toBe(true);
    expect(ps[0]!.last().players.map((p) => p.name)).toEqual(['P0', 'P1']);
    // the kicked client clears its seat, then may rejoin as a fresh player
    expect((await ps[2]!.emit('room:leave')).ok).toBe(true);
    expect((await ps[2]!.emit('room:join', { code: ps[0]!.creds.code, name: 'P2b' })).ok).toBe(true);
  });

  it('pause: freezes the clock, blocks the timer from firing, and resume restarts it', async () => {
    const host = await mk();
    const ps = [host];
    for (let i = 1; i < 5; i++) ps.push(await mk(host.creds.code, `P${i}`));
    await host.emit('host:settings', {}); // no-op, still valid
    expect((await host.emit('host:start')).ok).toBe(true);
    await wait(60);
    expect((await ps[1]!.emit('host:pause')).error).toBe('NOT_HOST');
    expect((await host.emit('host:pause')).ok).toBe(true);
    await wait(60);
    const v = ps[2]!.last();
    expect(v.paused).toBe(true);
    expect(v.phaseEndsAt).toBeNull();
    expect(v.phase).toBe('ROLE_REVEAL');
    expect((await host.emit('host:pause')).ok).toBe(true);
    await wait(60);
    expect(ps[2]!.last().paused).toBe(false);
    expect(ps[2]!.last().phaseEndsAt).not.toBeNull();
  });
});

describe('pause really stops the server timer', () => {
  it('does not advance while paused, then advances after resume', async () => {
    await server.close();
    await new Promise((r) => server.httpServer.close(r));
    server = createGameServer({
      clientOrigin: 'http://localhost:5173',
      minPlayers: 5,
      timing: { roleRevealSec: 0.4, nightSec: 30 },
    });
    await new Promise<void>((r) => server.httpServer.listen(0, r));
    url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
    const host = await mk();
    for (let i = 1; i < 5; i++) await mk(host.creds.code, `P${i}`);
    await host.emit('host:start');
    await wait(100);
    await host.emit('host:pause');
    await wait(900); // longer than the whole reveal phase
    expect(host.last().phase).toBe('ROLE_REVEAL');
    await host.emit('host:pause');
    await wait(700);
    expect(host.last().phase).toBe('NIGHT');
  });
});
