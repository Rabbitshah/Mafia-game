import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  addPlayer,
  createRoom,
  getStateFor,
  normalizeName,
  removePlayer,
  setConnection,
  advancePhase,
  allVotesIn,
  kickPlayer,
  togglePause,
  rematch,
  submitVote,
  skipPhase,
  startGame,
  submitNightAction,
  updateSettings,
  type Ack,
  type Creds,
  type Phase,
  type Result,
  type Room,
  type Settings,
} from '@mafia/shared';
import { hashToken, newRoomCode, newToken, normalizeCode, tokenMatches } from './auth';
import { RateLimiter } from './rateLimit';

/** Private-network browser origins (10.x, 172.16-31.x, 192.168.x) so phones on Wi-Fi can reach a dev server. */
const LAN_ORIGIN = /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export interface ServerOptions {
  /** Comma-separated list of allowed browser origins. */
  clientOrigin: string;
  /** Also allow LAN origins. Dev only: index.ts turns it on when CLIENT_ORIGIN is unset. */
  allowLan?: boolean;
  minPlayers?: number;
  maxRooms?: number;
  /** Lobby seats of disconnected players are freed after this long. */
  lobbyGraceMs?: number;
  /** Rooms with no activity for this long are deleted. */
  roomIdleMs?: number;
  /**
   * Number of reverse proxies in front of this server (Render = 1, to be verified). 0 means the
   * X-Forwarded-For header is ignored, because a client can set it to anything.
   */
  trustProxyHops?: number;
  /** Override phase lengths for new rooms (used by tests and FAST_PHASES dev mode). */
  timing?: Partial<Pick<Settings, 'roleRevealSec' | 'nightSec' | 'morningSec' | 'discussionSec' | 'voteSec' | 'eliminationSec'>>;
}

type AckFn = (res: Ack<Record<string, unknown>>) => void;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function createGameServer(opts: ServerOptions) {
  const minPlayers = opts.minPlayers ?? MIN_PLAYERS;
  const maxRooms = opts.maxRooms ?? 50;
  const lobbyGraceMs = opts.lobbyGraceMs ?? 30_000;
  const roomIdleMs = opts.roomIdleMs ?? 2 * 60 * 60 * 1000;
  const viewOpts = () => ({ minPlayers, maxPlayers: MAX_PLAYERS, now: Date.now() });

  const rooms = new Map<string, Room>();
  const lobbyTimers = new Map<string, NodeJS.Timeout>(); // key: `${code}:${playerId}`
  const phaseTimers = new Map<string, NodeJS.Timeout>(); // key: room code
  const eventLimiter = new RateLimiter(10, 1000); // per socket
  const createLimiter = new RateLimiter(5, 60_000); // per IP
  const joinLimiter = new RateLimiter(20, 60_000); // per IP

  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
  if (opts.allowLan) {
    // Dev only: lets the lobby QR use a Wi-Fi address instead of "localhost". Not exposed in production.
    app.get('/lan', (_req, res) => {
      const ip = Object.values(networkInterfaces()).flat().find((i) => i?.family === 'IPv4' && !i.internal)?.address;
      res.set('Access-Control-Allow-Origin', '*').json({ ip: ip ?? null });
    });
  }

  const httpServer = createHttpServer(app);
  const origins = opts.clientOrigin.split(',').map((s) => s.trim()).filter(Boolean);
  const originAllowed = (origin: string) => origins.includes(origin) || (opts.allowLan === true && LAN_ORIGIN.test(origin));
  const io = new Server(httpServer, {
    cors: { origin: opts.allowLan ? [...origins, LAN_ORIGIN] : origins },
    // CORS does not cover raw WebSockets, so check Origin on every connection too.
    // Browsers always send Origin; requests without one (scripts, tests) are not browser pages, so they pass.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin === undefined || originAllowed(origin));
    },
  });

  const now = () => Date.now();

  /** Send each connected player ONLY their own view. */
  function broadcast(room: Room): void {
    for (const p of room.players.values()) {
      if (!p.socketId) continue;
      const view = getStateFor(room, p.id, viewOpts());
      if (view) io.to(p.socketId).emit('state:snapshot', view);
    }
  }

  function save(room: Room): void {
    rooms.set(room.code, room);
  }

  const TIMED_PHASES = new Set<Phase>(['ROLE_REVEAL', 'NIGHT', 'MORNING', 'DISCUSSION', 'VOTING', 'RUNOFF', 'ELIMINATION']);

  function clearPhaseTimer(code: string): void {
    const t = phaseTimers.get(code);
    if (t) clearTimeout(t);
    phaseTimers.delete(code);
  }

  function deleteRoom(code: string): void {
    clearPhaseTimer(code);
    rooms.delete(code);
  }

  /** (Re)start the server-side timer for the room's current phase. Clients only display it. */
  function schedule(room: Room): void {
    clearPhaseTimer(room.code);
    if (room.phaseEndsAt === null || !TIMED_PHASES.has(room.phase)) return;
    const endsAt = room.phaseEndsAt;
    const timer = setTimeout(() => onPhaseEnd(room.code, endsAt), Math.max(0, endsAt - now()));
    timer.unref();
    phaseTimers.set(room.code, timer);
  }

  function onPhaseEnd(code: string, expectedEndsAt: number): void {
    phaseTimers.delete(code);
    const room = rooms.get(code);
    // Ignore stale timers (the host skipped the phase, or the room is gone).
    if (!room || room.phaseEndsAt !== expectedEndsAt) return;
    const next = advancePhase(room, Math.random, now());
    save(next);
    schedule(next);
    broadcast(next);
  }

  function clientIp(socket: Socket): string {
    const hops = opts.trustProxyHops ?? 0;
    if (hops > 0) {
      // Each trusted proxy appends the address it saw, so count from the right. Entries further
      // left were supplied by the client and cannot be trusted.
      const fwd = socket.handshake.headers['x-forwarded-for'];
      const parts = (Array.isArray(fwd) ? fwd.join(',') : (fwd ?? ''))
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      const ip = parts[parts.length - hops];
      if (ip) return ip;
    }
    return socket.handshake.address;
  }

  function cancelLobbyTimer(code: string, playerId: string): void {
    const key = `${code}:${playerId}`;
    const t = lobbyTimers.get(key);
    if (t) clearTimeout(t);
    lobbyTimers.delete(key);
  }

  function leaveLobby(code: string, playerId: string): void {
    cancelLobbyTimer(code, playerId);
    const room = rooms.get(code);
    if (!room) return;
    const r = removePlayer(room, playerId, now());
    if (!r.ok) return;
    if (r.value === null) deleteRoom(code);
    else {
      save(r.value);
      broadcast(r.value);
    }
  }

  const fail = (cb: AckFn, error: string) => cb({ ok: false, error });
  const unwrap = <T>(r: Result<T>, cb: AckFn): T | null => {
    if (!r.ok) {
      fail(cb, r.error);
      return null;
    }
    return r.value;
  };

  io.on('connection', (socket) => {
    const ctx: { code: string | null; playerId: string | null } = { code: null, playerId: null };

    // Per-socket flood control.
    socket.use((packet, next) => {
      if (eventLimiter.allow(socket.id)) return next();
      // Answer the caller too, otherwise a client waiting on its ack hangs forever.
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') (ack as AckFn)({ ok: false, error: 'RATE_LIMIT' });
      else next(new Error('RATE_LIMIT'));
    });

    const wrap =
      (handler: (payload: unknown, cb: AckFn) => void) =>
      (payload: unknown, cb?: unknown): void => {
        const ack: AckFn = typeof cb === 'function' ? (cb as AckFn) : () => {};
        try {
          handler(payload, ack);
        } catch (err) {
          console.error('handler error', (err as Error).message);
          fail(ack, 'SERVER_ERROR');
        }
      };

    const currentRoom = (): Room | null => (ctx.code ? (rooms.get(ctx.code) ?? null) : null);

    function attach(room: Room, playerId: string): Room | null {
      const r = setConnection(room, playerId, socket.id, now());
      if (!r.ok) return null;
      ctx.code = room.code;
      ctx.playerId = playerId;
      cancelLobbyTimer(room.code, playerId);
      save(r.value);
      return r.value;
    }

    socket.on(
      'room:create',
      wrap((payload, cb) => {
        if (ctx.playerId) return fail(cb, 'ALREADY_IN_ROOM');
        if (!createLimiter.allow(clientIp(socket))) return fail(cb, 'RATE_LIMIT');
        if (rooms.size >= maxRooms) return fail(cb, 'SERVER_BUSY');
        const name = normalizeName(isObj(payload) ? payload.name : null);
        if (!name) return fail(cb, 'INVALID_NAME');

        let code = newRoomCode();
        while (rooms.has(code)) code = newRoomCode();
        const playerId = randomUUID();
        const token = newToken();
        const fresh = createRoom(code, { id: playerId, name, tokenHash: hashToken(token), socketId: socket.id }, now());
        const room: Room = { ...fresh, settings: { ...fresh.settings, ...opts.timing } };
        ctx.code = code;
        ctx.playerId = playerId;
        save(room);
        const creds: Creds = { code, playerId, token };
        cb({ ok: true, ...creds });
        broadcast(room);
      }),
    );

    socket.on(
      'room:join',
      wrap((payload, cb) => {
        if (ctx.playerId) return fail(cb, 'ALREADY_IN_ROOM');
        if (!joinLimiter.allow(clientIp(socket))) return fail(cb, 'RATE_LIMIT');
        const p = isObj(payload) ? payload : {};
        const code = normalizeCode(p.code);
        const name = normalizeName(p.name);
        if (!code) return fail(cb, 'NO_SUCH_ROOM');
        if (!name) return fail(cb, 'INVALID_NAME');
        const room = rooms.get(code);
        if (!room) return fail(cb, 'NO_SUCH_ROOM');

        const playerId = randomUUID();
        const token = newToken();
        const added = unwrap(
          addPlayer(room, { id: playerId, name, tokenHash: hashToken(token), socketId: socket.id }, now()),
          cb,
        );
        if (!added) return;
        ctx.code = code;
        ctx.playerId = playerId;
        save(added);
        const creds: Creds = { code, playerId, token };
        cb({ ok: true, ...creds });
        broadcast(added);
      }),
    );

    socket.on(
      'room:rejoin',
      wrap((payload, cb) => {
        if (!joinLimiter.allow(clientIp(socket))) return fail(cb, 'RATE_LIMIT');
        const p = isObj(payload) ? payload : {};
        const code = normalizeCode(p.code);
        const room = code ? rooms.get(code) : undefined;
        const player = room && typeof p.playerId === 'string' ? room.players.get(p.playerId) : undefined;
        // Same error for every failure so codes and ids cannot be probed.
        if (!room || !player || !tokenMatches(p.token, player.tokenHash)) return fail(cb, 'REJOIN_FAILED');
        const updated = attach(room, player.id);
        if (!updated) return fail(cb, 'REJOIN_FAILED');
        cb({ ok: true });
        broadcast(updated);
      }),
    );

    socket.on(
      'room:leave',
      wrap((_payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        if (room.phase !== 'LOBBY') return fail(cb, 'NOT_IN_LOBBY');
        const { code, playerId } = { code: room.code, playerId: ctx.playerId };
        ctx.code = null;
        ctx.playerId = null;
        leaveLobby(code, playerId);
        cb({ ok: true });
      }),
    );

    socket.on(
      'state:request',
      wrap((_payload, cb) => {
        const room = currentRoom();
        const view = room && ctx.playerId ? getStateFor(room, ctx.playerId, viewOpts()) : null;
        if (!view) return fail(cb, 'NOT_IN_ROOM');
        socket.emit('state:snapshot', view);
        cb({ ok: true });
      }),
    );

    socket.on(
      'host:settings',
      wrap((payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        const patch = isObj(payload) ? payload : {};
        const updated = unwrap(updateSettings(room, ctx.playerId, patch, now()), cb);
        if (!updated) return;
        save(updated);
        cb({ ok: true });
        broadcast(updated);
      }),
    );

    socket.on(
      'host:start',
      wrap((_payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        const started = unwrap(startGame(room, ctx.playerId, Math.random, now(), minPlayers), cb);
        if (!started) return;
        save(started);
        schedule(started);
        cb({ ok: true });
        broadcast(started);
      }),
    );

    socket.on(
      'night:action',
      wrap((payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        const raw = isObj(payload) ? payload.target : undefined;
        if (raw !== null && typeof raw !== 'string') return fail(cb, 'INVALID_TARGET');
        const updated = unwrap(submitNightAction(room, ctx.playerId, raw, now()), cb);
        if (!updated) return;
        save(updated);
        cb({ ok: true });
        broadcast(updated);
      }),
    );

    socket.on(
      'vote:cast',
      wrap((payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        const raw = isObj(payload) ? payload.target : undefined;
        if (raw !== null && typeof raw !== 'string') return fail(cb, 'INVALID_TARGET');
        const voted = unwrap(submitVote(room, ctx.playerId, raw, now()), cb);
        if (!voted) return;
        // Votes are public by default, so the day can end as soon as everyone has voted.
        const next = allVotesIn(voted) ? advancePhase(voted, Math.random, now()) : voted;
        save(next);
        if (next !== voted) schedule(next);
        cb({ ok: true });
        broadcast(next);
      }),
    );

    socket.on(
      'host:rematch',
      wrap((_payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        const next = unwrap(rematch(room, ctx.playerId, now()), cb);
        if (!next) return;
        save(next);
        clearPhaseTimer(next.code);
        cb({ ok: true });
        broadcast(next);
      }),
    );

    socket.on(
      'host:kick',
      wrap((payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        const target = isObj(payload) && typeof payload.target === 'string' ? payload.target : '';
        const victim = room.players.get(target);
        const next = unwrap(kickPlayer(room, ctx.playerId, target, now()), cb);
        if (!next) return;
        cancelLobbyTimer(room.code, target);
        save(next);
        // Tell the kicked player first, then drop their socket from the room.
        if (victim?.socketId) io.to(victim.socketId).emit('room:kicked');
        cb({ ok: true });
        broadcast(next);
      }),
    );

    socket.on(
      'host:pause',
      wrap((_payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        const next = unwrap(togglePause(room, ctx.playerId, now()), cb);
        if (!next) return;
        save(next);
        schedule(next); // clears the timer while paused, restarts it on resume
        cb({ ok: true });
        broadcast(next);
      }),
    );

    socket.on(
      'host:skip',
      wrap((_payload, cb) => {
        const room = currentRoom();
        if (!room || !ctx.playerId) return fail(cb, 'NOT_IN_ROOM');
        const next = unwrap(skipPhase(room, ctx.playerId, Math.random, now()), cb);
        if (!next) return;
        save(next);
        schedule(next);
        cb({ ok: true });
        broadcast(next);
      }),
    );

    socket.on('disconnect', () => {
      eventLimiter.prune();
      const room = currentRoom();
      const playerId = ctx.playerId;
      if (!room || !playerId) return;
      const player = room.players.get(playerId);
      // Ignore if the seat was already taken over by a newer socket (rejoin).
      if (!player || player.socketId !== socket.id) return;
      const r = setConnection(room, playerId, null, now());
      if (!r.ok) return;
      save(r.value);
      broadcast(r.value);
      if (r.value.phase === 'LOBBY') {
        const key = `${room.code}:${playerId}`;
        const timer = setTimeout(() => {
          lobbyTimers.delete(key);
          const latest = rooms.get(room.code);
          if (latest?.players.get(playerId)?.connected === false) leaveLobby(room.code, playerId);
        }, lobbyGraceMs);
        timer.unref();
        lobbyTimers.set(key, timer);
      }
    });
  });

  // Delete idle rooms and old rate-limit entries.
  const sweeper = setInterval(() => {
    const t = now();
    for (const [code, room] of rooms) if (t - room.lastActivityAt > roomIdleMs) deleteRoom(code);
    createLimiter.prune();
    joinLimiter.prune();
  }, 10 * 60 * 1000);
  sweeper.unref();

  return {
    httpServer,
    io,
    rooms,
    close: async () => {
      clearInterval(sweeper);
      for (const t of lobbyTimers.values()) clearTimeout(t);
      lobbyTimers.clear();
      for (const t of phaseTimers.values()) clearTimeout(t);
      phaseTimers.clear();
      await io.close();
    },
  };
}
