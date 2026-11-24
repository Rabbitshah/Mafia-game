import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Creds, PlayerView } from '@mafia/shared';
import { createGameServer } from './server';

type Server = ReturnType<typeof createGameServer>;
interface TC {
  socket: Socket;
  creds: Creds;
  last: () => PlayerView;
  emit: (event: string, payload?: unknown) => Promise<{ ok: boolean; error?: string; [k: string]: unknown }>;
}

let server: Server;
let url: string;
const sockets: Socket[] = [];

async function setup(timing?: Parameters<typeof createGameServer>[0]['timing']) {
  server = createGameServer({ clientOrigin: 'http://localhost:5173', minPlayers: 5, lobbyGraceMs: 50, timing });
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
}

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await server.close();
  await new Promise((r) => server.httpServer.close(r));
});

async function mk(first: boolean, code?: string, name = 'P'): Promise<TC> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  let last!: PlayerView;
  socket.on('state:snapshot', (v: PlayerView) => (last = v));
  await new Promise<void>((r) => socket.on('connect', () => r()));
  const emit: TC['emit'] = (e, p) => new Promise((res) => socket.emit(e, p, res));
  const r = await emit(first ? 'room:create' : 'room:join', first ? { name } : { code, name });
  return { socket, creds: r as unknown as Creds, last: () => last, emit };
}

async function game(n = 5): Promise<TC[]> {
  const host = await mk(true, undefined, 'P0');
  const ps = [host];
  for (let i = 1; i < n; i++) ps.push(await mk(false, host.creds.code, `P${i}`));
  expect((await host.emit('host:start')).ok).toBe(true);
  await wait(60);
  return ps;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const byRole = (ps: TC[], role: string) => ps.filter((p) => p.last().you.role === role);

describe('night flow (manual skip)', () => {
  beforeEach(() => setup());

  it('only the host can skip, and skip moves reveal -> night', async () => {
    const ps = await game();
    expect((await ps[1]!.emit('host:skip')).error).toBe('NOT_HOST');
    expect((await ps[0]!.emit('host:skip')).ok).toBe(true);
    await wait(60);
    expect(ps[0]!.last().phase).toBe('NIGHT');
  });

  it('rejects night actions outside night and from non-night roles', async () => {
    const ps = await game();
    const m = byRole(ps, 'mafia')[0]!;
    expect((await m.emit('night:action', { target: null })).error).toBe('WRONG_PHASE');
    await ps[0]!.emit('host:skip');
    await wait(60);
    const v = byRole(ps, 'villager')[0]!;
    expect((await v.emit('night:action', { target: null })).error).toBe('NO_NIGHT_ACTION');
    expect((await m.emit('night:action', {})).error).toBe('INVALID_TARGET');
  });

  it('mafia kill resolves into the morning and shows the dead player', async () => {
    const ps = await game();
    await ps[0]!.emit('host:skip');
    await wait(60);
    const m = byRole(ps, 'mafia')[0]!;
    const victim = ps.find((p) => p.last().you.role === 'villager')!;
    expect((await m.emit('night:action', { target: victim.creds.playerId })).ok).toBe(true);
    await ps[0]!.emit('host:skip');
    await wait(60);
    for (const p of ps) {
      expect(p.last().phase === 'MORNING' || p.last().phase === 'GAME_OVER').toBe(true);
      expect(p.last().morning?.deathIds).toContain(victim.creds.playerId);
    }
  });

  it('wire-level: no role leaks during night (villagers see nothing about others)', async () => {
    const ps = await game();
    await ps[0]!.emit('host:skip');
    await wait(60);
    const v = byRole(ps, 'villager')[0]!;
    const { you, ...pub } = v.last();
    expect(JSON.stringify(pub)).not.toMatch(/"(mafia|doctor|detective|villager)"/);
    expect(v.last().night).toBeNull();
  });
});

describe('server timers', () => {
  beforeEach(() => setup({ roleRevealSec: 0.1, nightSec: 0.15, morningSec: 0.1, discussionSec: 5 }));

  it('advances reveal -> night -> morning -> discussion by itself', async () => {
    const ps = await game();
    await wait(900);
    expect(ps[0]!.last().phase).toBe('DISCUSSION');
  });
});
