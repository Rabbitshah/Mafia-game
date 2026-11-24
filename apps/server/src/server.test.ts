import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Creds, PlayerView, RoleId } from '@mafia/shared';
import { createGameServer } from './server';

type Server = ReturnType<typeof createGameServer>;

interface TestClient {
  socket: Socket;
  last: () => PlayerView | undefined;
  emit: <T = Record<string, unknown>>(event: string, payload?: unknown) => Promise<{ ok: boolean; error?: string } & T>;
}

let server: Server;
let url: string;
let clients: Socket[] = [];

beforeEach(async () => {
  server = createGameServer({ clientOrigin: 'http://localhost:5173', minPlayers: 5, lobbyGraceMs: 50 });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const s of clients) s.close();
  clients = [];
  await server.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
});

async function client(): Promise<TestClient> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  let last: PlayerView | undefined;
  socket.on('state:snapshot', (v: PlayerView) => {
    last = v;
  });
  await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
  return {
    socket,
    last: () => last,
    emit: (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve)),
  };
}

async function fullLobby(n: number) {
  const host = await client();
  const created = await host.emit<Creds>('room:create', { name: 'P0' });
  expect(created.ok).toBe(true);
  const players: { c: TestClient; creds: Creds }[] = [{ c: host, creds: created as unknown as Creds }];
  for (let i = 1; i < n; i++) {
    const c = await client();
    const joined = await c.emit<Creds>('room:join', { code: created.code, name: `P${i}` });
    expect(joined.ok).toBe(true);
    players.push({ c, creds: joined as unknown as Creds });
  }
  return players;
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe('lobby', () => {
  it('creates a room and lets others join by code', async () => {
    const players = await fullLobby(3);
    await settle();
    const view = players[0]!.c.last()!;
    expect(view.phase).toBe('LOBBY');
    expect(view.players.map((p) => p.name)).toEqual(['P0', 'P1', 'P2']);
    expect(view.players[0]!.isHost).toBe(true);
    expect(view.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  it('rejects bad codes, bad names and duplicate names', async () => {
    const [host] = await fullLobby(1);
    const c = await client();
    expect((await c.emit('room:join', { code: 'ZZZZZZ', name: 'X' })).error).toBe('NO_SUCH_ROOM');
    expect((await c.emit('room:join', { code: host!.creds.code, name: '   ' })).error).toBe('INVALID_NAME');
    expect((await c.emit('room:join', { code: host!.creds.code, name: 'p0' })).error).toBe('NAME_TAKEN');
  });

  it('frees a disconnected lobby seat after the grace period and moves host', async () => {
    const players = await fullLobby(3);
    players[0]!.c.socket.close();
    await new Promise((r) => setTimeout(r, 200));
    const view = players[1]!.c.last()!;
    expect(view.players.map((p) => p.name)).toEqual(['P1', 'P2']);
    expect(view.hostId).toBe(players[1]!.creds.playerId);
  });

  it('leave removes the player right away', async () => {
    const players = await fullLobby(3);
    expect((await players[2]!.c.emit('room:leave')).ok).toBe(true);
    await settle();
    expect(players[0]!.c.last()!.players).toHaveLength(2);
  });
});

describe('starting a game', () => {
  it('only the host can start, and only with enough players', async () => {
    const players = await fullLobby(4);
    expect((await players[0]!.c.emit('host:start')).error).toBe('NOT_ENOUGH_PLAYERS');
    const five = await client();
    await five.emit('room:join', { code: players[0]!.creds.code, name: 'P4' });
    expect((await players[1]!.c.emit('host:start')).error).toBe('NOT_HOST');
    expect((await players[0]!.c.emit('host:start')).ok).toBe(true);
  });

  it('deals one role to each player with the right counts', async () => {
    const players = await fullLobby(7);
    await players[0]!.c.emit('host:start');
    await settle();
    const roles = players.map((p) => p.c.last()!.you.role as RoleId);
    expect(roles.every(Boolean)).toBe(true);
    expect(roles.filter((r) => r === 'mafia')).toHaveLength(2);
    expect(roles.filter((r) => r === 'doctor')).toHaveLength(1);
    expect(roles.filter((r) => r === 'detective')).toHaveLength(1);
    expect(roles.filter((r) => r === 'villager')).toHaveLength(3);
    expect(players[0]!.c.last()!.phase).toBe('ROLE_REVEAL');
  });

  it('LEAK TEST: no snapshot on the wire contains another player role or secret', async () => {
    const players = await fullLobby(9);
    await players[0]!.c.emit('host:start');
    await settle();
    for (const { c } of players) {
      const view = c.last()!;
      const { you, ...publicPart } = view;
      const publicJson = JSON.stringify(publicPart);
      expect(publicJson).not.toMatch(/"(mafia|doctor|detective|villager)"/);
      expect(publicJson).not.toMatch(/tokenHash|socketId|token/);
      for (const p of view.players) {
        expect(Object.keys(p).sort()).toEqual(['alive', 'connected', 'id', 'isHost', 'name', 'revealedRole']);
      }
      if (you.role !== 'mafia') expect(you.teammates).toEqual([]);
    }
    // Mafia see each other.
    const mafia = players.filter((p) => p.c.last()!.you.role === 'mafia');
    for (const m of mafia) {
      expect(m.c.last()!.you.teammates).toHaveLength(mafia.length - 1);
    }
  });

  it('blocks joining after the game started', async () => {
    const players = await fullLobby(5);
    await players[0]!.c.emit('host:start');
    const late = await client();
    expect((await late.emit('room:join', { code: players[0]!.creds.code, name: 'Late' })).error).toBe('GAME_STARTED');
  });
});

describe('rejoin', () => {
  it('restores the same seat and role with the right token', async () => {
    const players = await fullLobby(5);
    await players[0]!.c.emit('host:start');
    await settle();
    const target = players[2]!;
    const roleBefore = target.c.last()!.you.role;
    target.c.socket.close();
    await settle();

    const fresh = await client();
    const res = await fresh.emit('room:rejoin', target.creds);
    expect(res.ok).toBe(true);
    await settle();
    const view = fresh.last()!;
    expect(view.selfId).toBe(target.creds.playerId);
    expect(view.you.role).toBe(roleBefore);
  });

  it('refuses a wrong token, wrong id or wrong code with the same error', async () => {
    const [host] = await fullLobby(1);
    const c = await client();
    const bad = [
      { ...host!.creds, token: 'nope' },
      { ...host!.creds, playerId: 'nobody' },
      { ...host!.creds, code: 'ZZZZZZ' },
    ];
    for (const creds of bad) expect((await c.emit('room:rejoin', creds)).error).toBe('REJOIN_FAILED');
  });
});

describe('limits', () => {
  it('rate limits room creation per IP', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const c = await client();
      results.push((await c.emit('room:create', { name: `H${i}` })).ok);
      await new Promise((r) => setTimeout(r, 120)); // stay under the 10 events/sec socket limit
    }
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('answers a flooded caller with RATE_LIMIT instead of staying silent', async () => {
    const c = await client();
    const replies = await Promise.all(Array.from({ length: 30 }, () => c.emit('state:request')));
    expect(replies.some((r) => r.error === 'RATE_LIMIT')).toBe(true);
  });

  it('ignores a spoofed X-Forwarded-For unless proxies are trusted', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const socket = connect(url, {
        transports: ['websocket'],
        forceNew: true,
        extraHeaders: { 'x-forwarded-for': `9.9.9.${i}` },
      });
      clients.push(socket);
      await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
      const r = await new Promise<{ ok: boolean }>((resolve) => socket.emit('room:create', { name: `S${i}` }, resolve));
      results.push(r.ok);
      await new Promise((r2) => setTimeout(r2, 120));
    }
    expect(results.filter(Boolean)).toHaveLength(5); // spoofing did not buy a fresh quota
  });
});
