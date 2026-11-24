import { ROLES } from './roles';
import type { EliminationSummary, Investigation, Phase, Player, PlayerView, RoleId, Room, Settings, Team } from './types';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;
export const MAX_NAME_LENGTH = 20;

const NIGHT_ROLES: readonly RoleId[] = ['mafia', 'doctor', 'detective'];

export type Rng = () => number;

export type EngineError =
  | 'INVALID_NAME'
  | 'NAME_TAKEN'
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NOT_HOST'
  | 'NOT_IN_LOBBY'
  | 'NOT_ENOUGH_PLAYERS'
  | 'BAD_SETTINGS'
  | 'NO_SUCH_PLAYER'
  | 'WRONG_PHASE'
  | 'NOT_ALIVE'
  | 'NO_NIGHT_ACTION'
  | 'INVALID_TARGET'
  | 'NOT_FINISHED'
  | 'PAUSED'
  | 'NOT_PAUSABLE';

export type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: EngineError): Result<never> => ({ ok: false, error });

export function defaultSettings(): Settings {
  return {
    mafiaCount: 'auto',
    roleRevealSec: 20,
    morningSec: 8,
    eliminationSec: 8,
    discussionSec: 120,
    voteSec: 45,
    nightSec: 30,
    doctorSelfSave: 'once',
    revealOnDeath: true,
    tieRule: 'runoff',
    publicVotes: true,
  };
}

/** Trim, collapse spaces, drop control characters. Returns null if invalid. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

export function mafiaCountFor(playerCount: number): number {
  if (playerCount <= 6) return 1;
  if (playerCount <= 9) return 2;
  if (playerCount <= 13) return 3;
  return 4;
}

/** Town must still outnumber Mafia after the first night kill, or the game ends on night one. */
export function maxMafiaFor(playerCount: number): number {
  return Math.max(1, Math.floor((playerCount - 2) / 2));
}

export function resolveMafiaCount(playerCount: number, settings: Settings): number {
  if (settings.mafiaCount === 'auto') return mafiaCountFor(playerCount);
  return Math.min(Math.max(1, settings.mafiaCount), maxMafiaFor(playerCount));
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Shuffled role list. Needs at least MIN_PLAYERS so Doctor and Detective always fit. */
export function buildRoles(playerCount: number, settings: Settings, rng: Rng): RoleId[] {
  const mafia = resolveMafiaCount(playerCount, settings);
  const roles: RoleId[] = [
    ...Array<RoleId>(mafia).fill('mafia'),
    'doctor',
    'detective',
    ...Array<RoleId>(playerCount - mafia - 2).fill('villager'),
  ];
  return shuffle(roles, rng);
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export function createRoom(
  code: string,
  host: { id: string; name: string; tokenHash: string; socketId: string | null },
  now: number,
): Room {
  const player: Player = {
    id: host.id,
    tokenHash: host.tokenHash,
    name: host.name,
    socketId: host.socketId,
    role: null,
    alive: true,
    connected: host.socketId !== null,
  };
  return {
    code,
    hostId: host.id,
    phase: 'LOBBY',
    day: 0,
    phaseEndsAt: null,
    players: new Map([[host.id, player]]),
    settings: defaultSettings(),
    nightActions: {},
    doctorSelfSaveUsed: false,
    lastProtectedId: null,
    investigations: [],
    morning: null,
    votes: {},
    runoffCandidates: [],
    elimination: null,
    paused: false,
    pausedMs: null,
    winner: null,
    createdAt: now,
    lastActivityAt: now,
  };
}

export function addPlayer(
  room: Room,
  p: { id: string; name: string; tokenHash: string; socketId: string | null },
  now: number,
): Result<Room> {
  if (room.phase !== 'LOBBY') return fail('GAME_STARTED');
  if (room.players.size >= MAX_PLAYERS) return fail('ROOM_FULL');
  const lower = p.name.toLowerCase();
  for (const existing of room.players.values()) {
    if (existing.name.toLowerCase() === lower) return fail('NAME_TAKEN');
  }
  const players = new Map(room.players);
  players.set(p.id, {
    id: p.id,
    tokenHash: p.tokenHash,
    name: p.name,
    socketId: p.socketId,
    role: null,
    alive: true,
    connected: p.socketId !== null,
  });
  return ok({ ...room, players, lastActivityAt: now });
}

/** Lobby only. Passes host to the next player in seat order. Returns null room when empty. */
export function removePlayer(room: Room, playerId: string, now: number): Result<Room | null> {
  if (room.phase !== 'LOBBY') return fail('NOT_IN_LOBBY');
  if (!room.players.has(playerId)) return fail('NO_SUCH_PLAYER');
  const players = new Map(room.players);
  players.delete(playerId);
  if (players.size === 0) return ok(null);
  const hostId = room.hostId === playerId ? (players.keys().next().value as string) : room.hostId;
  return ok({ ...room, players, hostId, lastActivityAt: now });
}

export function setConnection(
  room: Room,
  playerId: string,
  socketId: string | null,
  now: number,
): Result<Room> {
  const player = room.players.get(playerId);
  if (!player) return fail('NO_SUCH_PLAYER');
  const players = new Map(room.players);
  players.set(playerId, { ...player, socketId, connected: socketId !== null });
  return ok({ ...room, players, lastActivityAt: now });
}

/** Allowed ranges (seconds) for host-editable timers. */
export const TIMER_LIMITS = {
  roleRevealSec: [5, 60],
  nightSec: [15, 120],
  morningSec: [3, 30],
  discussionSec: [30, 600],
  voteSec: [15, 180],
  eliminationSec: [3, 30],
} as const;

type TimerKey = keyof typeof TIMER_LIMITS;

export function updateSettings(
  room: Room,
  actorId: string,
  patch: Record<string, unknown>,
  now: number,
): Result<Room> {
  if (actorId !== room.hostId) return fail('NOT_HOST');
  if (room.phase !== 'LOBBY') return fail('NOT_IN_LOBBY');
  const settings: Settings = { ...room.settings };

  if (patch.mafiaCount !== undefined) {
    const v = patch.mafiaCount;
    const valid = v === 'auto' || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 7);
    if (!valid) return fail('BAD_SETTINGS');
    settings.mafiaCount = v as Settings['mafiaCount'];
  }
  for (const key of Object.keys(TIMER_LIMITS) as TimerKey[]) {
    const v = patch[key];
    if (v === undefined) continue;
    const [min, max] = TIMER_LIMITS[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return fail('BAD_SETTINGS');
    settings[key] = v;
  }
  if (patch.tieRule !== undefined) {
    if (patch.tieRule !== 'runoff' && patch.tieRule !== 'none' && patch.tieRule !== 'random') return fail('BAD_SETTINGS');
    settings.tieRule = patch.tieRule;
  }
  if (patch.doctorSelfSave !== undefined) {
    if (patch.doctorSelfSave !== 'always' && patch.doctorSelfSave !== 'once' && patch.doctorSelfSave !== 'never') {
      return fail('BAD_SETTINGS');
    }
    settings.doctorSelfSave = patch.doctorSelfSave;
  }
  for (const key of ['publicVotes', 'revealOnDeath'] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') return fail('BAD_SETTINGS');
    settings[key] = v;
  }
  return ok({ ...room, settings, lastActivityAt: now });
}

/** Host removes a player from the lobby. Mid-game, use skip instead. */
export function kickPlayer(room: Room, actorId: string, targetId: string, now: number): Result<Room> {
  if (actorId !== room.hostId) return fail('NOT_HOST');
  if (room.phase !== 'LOBBY') return fail('NOT_IN_LOBBY');
  if (targetId === actorId || !room.players.has(targetId)) return fail('NO_SUCH_PLAYER');
  const players = new Map(room.players);
  players.delete(targetId);
  return ok({ ...room, players, lastActivityAt: now });
}

export function startGame(
  room: Room,
  actorId: string,
  rng: Rng,
  now: number,
  minPlayers: number = MIN_PLAYERS,
): Result<Room> {
  if (actorId !== room.hostId) return fail('NOT_HOST');
  if (room.phase !== 'LOBBY') return fail('NOT_IN_LOBBY');
  if (room.players.size < minPlayers) return fail('NOT_ENOUGH_PLAYERS');
  const roles = buildRoles(room.players.size, room.settings, rng);
  const players = new Map<string, Player>();
  let i = 0;
  for (const p of room.players.values()) {
    players.set(p.id, { ...p, role: roles[i++] ?? 'villager', alive: true });
  }
  return ok({
    ...room,
    players,
    phase: 'ROLE_REVEAL',
    day: 0,
    phaseEndsAt: now + room.settings.roleRevealSec * 1000,
    nightActions: {},
    doctorSelfSaveUsed: false,
    lastProtectedId: null,
    investigations: [],
    morning: null,
    votes: {},
    runoffCandidates: [],
    elimination: null,
    paused: false,
    pausedMs: null,
    winner: null,
    lastActivityAt: now,
  });
}

// ---------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------

function selfSaveAllowed(room: Room): boolean {
  if (room.settings.doctorSelfSave === 'always') return true;
  if (room.settings.doctorSelfSave === 'never') return false;
  return !room.doctorSelfSaveUsed;
}

const PAUSABLE: readonly Phase[] = ['ROLE_REVEAL', 'NIGHT', 'MORNING', 'DISCUSSION', 'VOTING', 'RUNOFF', 'ELIMINATION'];

/** Host stops the clock. Calling it again resumes with the time that was left. */
export function togglePause(room: Room, actorId: string, now: number): Result<Room> {
  if (actorId !== room.hostId) return fail('NOT_HOST');
  if (!PAUSABLE.includes(room.phase)) return fail('NOT_PAUSABLE');
  if (room.paused) {
    return ok({ ...room, paused: false, pausedMs: null, phaseEndsAt: now + (room.pausedMs ?? 0), lastActivityAt: now });
  }
  if (room.phaseEndsAt === null) return fail('NOT_PAUSABLE');
  return ok({ ...room, paused: true, pausedMs: Math.max(0, room.phaseEndsAt - now), phaseEndsAt: null, lastActivityAt: now });
}

/** Ids this player may pick tonight. Empty if it is not night or they have no power. */
export function nightTargets(room: Room, actorId: string): string[] {
  const actor = room.players.get(actorId);
  if (room.phase !== 'NIGHT' || !actor || !actor.alive || !actor.role) return [];
  const alive = [...room.players.values()].filter((p) => p.alive);
  switch (actor.role) {
    case 'mafia':
      return alive.filter((p) => p.role !== 'mafia').map((p) => p.id);
    case 'doctor':
      return alive
        .filter((p) => p.id !== room.lastProtectedId && (p.id !== actor.id || selfSaveAllowed(room)))
        .map((p) => p.id);
    case 'detective':
      return alive.filter((p) => p.id !== actor.id).map((p) => p.id);
    default:
      return [];
  }
}

/** Record a night choice. `target` null means "nobody". The latest choice wins until the night ends. */
export function submitNightAction(
  room: Room,
  actorId: string,
  target: string | null,
  now: number,
): Result<Room> {
  const actor = room.players.get(actorId);
  if (!actor) return fail('NO_SUCH_PLAYER');
  if (room.phase !== 'NIGHT') return fail('WRONG_PHASE');
  if (room.paused) return fail('PAUSED');
  if (!actor.alive) return fail('NOT_ALIVE');
  if (!actor.role || !NIGHT_ROLES.includes(actor.role)) return fail('NO_NIGHT_ACTION');
  if (target !== null && !nightTargets(room, actorId).includes(target)) return fail('INVALID_TARGET');
  return ok({ ...room, nightActions: { ...room.nightActions, [actorId]: target }, lastActivityAt: now });
}

export function checkWin(room: Room): Team | null {
  let mafia = 0;
  let others = 0;
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    if (p.role === 'mafia') mafia++;
    else others++;
  }
  if (mafia === 0) return 'town';
  if (mafia >= others) return 'mafia';
  return null;
}

function beginNight(room: Room, now: number): Room {
  return {
    ...room,
    phase: 'NIGHT',
    day: room.day + 1,
    nightActions: {},
    morning: null,
    phaseEndsAt: now + room.settings.nightSec * 1000,
    lastActivityAt: now,
  };
}

/**
 * Resolve the night. Missing choices count as "no action".
 * Mafia pick by plurality; ties go to rng. A Doctor save cancels the kill.
 */
function resolveNight(room: Room, rng: Rng, now: number): Room {
  const alive = [...room.players.values()].filter((p) => p.alive);

  // Mafia kill: count each alive Mafia's still-valid pick.
  const votes = new Map<string, number>();
  for (const m of alive.filter((p) => p.role === 'mafia')) {
    const t = room.nightActions[m.id];
    if (t && room.players.get(t)?.alive && room.players.get(t)?.role !== 'mafia') {
      votes.set(t, (votes.get(t) ?? 0) + 1);
    }
  }
  let killId: string | null = null;
  if (votes.size > 0) {
    const top = Math.max(...votes.values());
    const tied = [...votes].filter(([, n]) => n === top).map(([id]) => id);
    killId = tied.length === 1 ? (tied[0] as string) : (tied[Math.floor(rng() * tied.length)] as string);
  }

  // Doctor save.
  const doctor = alive.find((p) => p.role === 'doctor');
  const protectId = doctor ? (room.nightActions[doctor.id] ?? null) : null;
  const deathIds = killId !== null && killId !== protectId ? [killId] : [];

  // Detective finding.
  const investigations: Investigation[] = [...room.investigations];
  const detective = alive.find((p) => p.role === 'detective');
  const probeId = detective ? (room.nightActions[detective.id] ?? null) : null;
  const probed = probeId ? room.players.get(probeId) : undefined;
  if (detective && probed) {
    investigations.push({
      day: room.day,
      detectiveId: detective.id,
      targetId: probed.id,
      isMafia: probed.role === 'mafia',
    });
  }

  const players = new Map(room.players);
  for (const id of deathIds) {
    const p = players.get(id);
    if (p) players.set(id, { ...p, alive: false });
  }

  const next: Room = {
    ...room,
    players,
    investigations,
    morning: { day: room.day, deathIds },
    lastProtectedId: doctor ? protectId : room.lastProtectedId,
    doctorSelfSaveUsed: room.doctorSelfSaveUsed || (doctor !== undefined && protectId === doctor.id),
    nightActions: {},
    lastActivityAt: now,
  };

  const winner = checkWin(next);
  if (winner) return { ...next, phase: 'GAME_OVER', winner, phaseEndsAt: null };
  return { ...next, phase: 'MORNING', phaseEndsAt: now + room.settings.morningSec * 1000 };
}

// ---------------------------------------------------------------------------
// Day vote
// ---------------------------------------------------------------------------

/** Ids this player may vote for right now. Empty if they cannot vote. */
export function voteTargets(room: Room, voterId: string): string[] {
  const voter = room.players.get(voterId);
  if ((room.phase !== 'VOTING' && room.phase !== 'RUNOFF') || !voter || !voter.alive) return [];
  const pool =
    room.phase === 'RUNOFF'
      ? room.runoffCandidates
      : [...room.players.values()].filter((p) => p.alive).map((p) => p.id);
  return pool.filter((id) => id !== voterId && room.players.get(id)?.alive);
}

/** Record a vote. `target` null means "abstain". The latest choice wins until voting ends. */
export function submitVote(room: Room, voterId: string, target: string | null, now: number): Result<Room> {
  const voter = room.players.get(voterId);
  if (!voter) return fail('NO_SUCH_PLAYER');
  if (room.phase !== 'VOTING' && room.phase !== 'RUNOFF') return fail('WRONG_PHASE');
  if (room.paused) return fail('PAUSED');
  if (!voter.alive) return fail('NOT_ALIVE');
  if (target !== null && !voteTargets(room, voterId).includes(target)) return fail('INVALID_TARGET');
  return ok({ ...room, votes: { ...room.votes, [voterId]: target }, lastActivityAt: now });
}

/** True once every living player has locked in a vote (abstaining counts). */
export function allVotesIn(room: Room): boolean {
  if (room.phase !== 'VOTING' && room.phase !== 'RUNOFF') return false;
  return [...room.players.values()].filter((p) => p.alive).every((p) => p.id in room.votes);
}

function startVoting(room: Room, now: number): Room {
  return {
    ...room,
    phase: 'VOTING',
    votes: {},
    runoffCandidates: [],
    phaseEndsAt: now + room.settings.voteSec * 1000,
    lastActivityAt: now,
  };
}

function resolveVote(room: Room, rng: Rng, now: number): Room {
  const counts = new Map<string, number>();
  const allowed = new Set(
    room.phase === 'RUNOFF'
      ? room.runoffCandidates
      : [...room.players.values()].filter((p) => p.alive).map((p) => p.id),
  );
  const votes: EliminationSummary['votes'] = [];
  for (const p of room.players.values()) {
    if (!p.alive || !(p.id in room.votes)) continue;
    const t = room.votes[p.id] ?? null;
    const valid = t !== null && t !== p.id && allowed.has(t) && room.players.get(t)?.alive === true;
    votes.push({ voterId: p.id, targetId: valid ? t : null });
    if (valid) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const tally = [...counts].map(([targetId, count]) => ({ targetId, count })).sort((a, b) => b.count - a.count);
  const top = tally[0]?.count ?? 0;
  const tied = tally.filter((t) => t.count === top).map((t) => t.targetId);

  let eliminatedId: string | null = null;
  let outcome: EliminationSummary['outcome'] = 'no_votes';
  if (tally.length > 0) {
    if (tied.length === 1) {
      eliminatedId = tied[0] as string;
      outcome = 'eliminated';
    } else if (room.phase === 'VOTING' && room.settings.tieRule === 'runoff') {
      return {
        ...room,
        phase: 'RUNOFF',
        votes: {},
        runoffCandidates: tied,
        phaseEndsAt: now + room.settings.voteSec * 1000,
        lastActivityAt: now,
      };
    } else if (room.settings.tieRule === 'random') {
      eliminatedId = tied[Math.floor(rng() * tied.length)] as string;
      outcome = 'eliminated';
    } else {
      outcome = 'tie';
    }
  }

  const players = new Map(room.players);
  if (eliminatedId) {
    const p = players.get(eliminatedId);
    if (p) players.set(eliminatedId, { ...p, alive: false });
  }
  const next: Room = {
    ...room,
    players,
    votes: {},
    runoffCandidates: [],
    elimination: { day: room.day, outcome, eliminatedId, tally, votes },
    lastActivityAt: now,
  };
  const winner = checkWin(next);
  if (winner) return { ...next, phase: 'GAME_OVER', winner, phaseEndsAt: null };
  return { ...next, phase: 'ELIMINATION', phaseEndsAt: now + room.settings.eliminationSec * 1000 };
}

/** Move to the next phase. Called when a timer ends, everyone has voted, or the host skips. */
export function advancePhase(room: Room, rng: Rng, now: number): Room {
  return { ...advanceInner(room, rng, now), paused: false, pausedMs: null };
}

function advanceInner(room: Room, rng: Rng, now: number): Room {
  switch (room.phase) {
    case 'ROLE_REVEAL':
      return beginNight(room, now);
    case 'NIGHT':
      return resolveNight(room, rng, now);
    case 'MORNING':
      return { ...room, phase: 'DISCUSSION', phaseEndsAt: now + room.settings.discussionSec * 1000, lastActivityAt: now };
    case 'DISCUSSION':
      return startVoting(room, now);
    case 'VOTING':
    case 'RUNOFF':
      return resolveVote(room, rng, now);
    case 'ELIMINATION':
      return beginNight(room, now);
    default:
      return room;
  }
}

const SKIPPABLE: readonly Phase[] = ['ROLE_REVEAL', 'NIGHT', 'MORNING', 'DISCUSSION', 'VOTING', 'RUNOFF', 'ELIMINATION'];

/** Host moves the game along (for example when someone is away). */
export function skipPhase(room: Room, actorId: string, rng: Rng, now: number): Result<Room> {
  if (actorId !== room.hostId) return fail('NOT_HOST');
  if (!SKIPPABLE.includes(room.phase)) return fail('WRONG_PHASE');
  return ok(advancePhase(room, rng, now));
}

/** Play again: back to the lobby with the same players. Players who left the game are dropped. */
export function rematch(room: Room, actorId: string, now: number): Result<Room> {
  if (actorId !== room.hostId) return fail('NOT_HOST');
  if (room.phase !== 'GAME_OVER') return fail('NOT_FINISHED');
  const players = new Map<string, Player>();
  for (const p of room.players.values()) {
    if (p.connected) players.set(p.id, { ...p, role: null, alive: true });
  }
  return ok({
    ...room,
    players,
    phase: 'LOBBY',
    day: 0,
    phaseEndsAt: null,
    nightActions: {},
    doctorSelfSaveUsed: false,
    lastProtectedId: null,
    investigations: [],
    morning: null,
    votes: {},
    runoffCandidates: [],
    elimination: null,
    paused: false,
    pausedMs: null,
    winner: null,
    lastActivityAt: now,
  });
}

// ---------------------------------------------------------------------------
// What clients may see
// ---------------------------------------------------------------------------

export interface ViewOptions {
  minPlayers?: number;
  maxPlayers?: number;
  /** Server clock, so clients can correct their countdown. */
  now?: number;
}

/**
 * The ONLY way room data may leave the server.
 * Other players' roles are never included, except where the rules make them public
 * (a dead player's role when "reveal on death" is on, and everyone's at GAME_OVER).
 */
export function getStateFor(room: Room, playerId: string, opts: ViewOptions = {}): PlayerView | null {
  const self = room.players.get(playerId);
  if (!self) return null;
  const gameOver = room.phase === 'GAME_OVER';
  const all = [...room.players.values()];

  const teammates =
    self.role === 'mafia'
      ? all.filter((p) => p.role === 'mafia' && p.id !== self.id).map((p) => ({ id: p.id, name: p.name }))
      : [];

  let night: PlayerView['night'] = null;
  if (room.phase === 'NIGHT' && self.alive && self.role && NIGHT_ROLES.includes(self.role)) {
    const targets = nightTargets(room, self.id).map((id) => ({ id, name: room.players.get(id)?.name ?? '' }));
    night = {
      targets,
      chosen: room.nightActions[self.id] ?? null,
      submitted: self.id in room.nightActions,
      teammateVotes:
        self.role === 'mafia'
          ? all
              .filter((p) => p.role === 'mafia' && p.alive && p.id !== self.id && p.id in room.nightActions)
              .map((p) => ({ voterId: p.id, voterName: p.name, targetId: room.nightActions[p.id] ?? null }))
          : [],
    };
  }

  let voting: PlayerView['voting'] = null;
  if (room.phase === 'VOTING' || room.phase === 'RUNOFF') {
    const pool =
      room.phase === 'RUNOFF'
        ? room.runoffCandidates
        : all.filter((p) => p.alive).map((p) => p.id);
    voting = {
      round: room.phase === 'RUNOFF' ? 2 : 1,
      candidates: pool.filter((id) => id !== self.id && room.players.get(id)?.alive).map((id) => ({ id, name: room.players.get(id)?.name ?? '' })),
      canVote: self.alive,
      chosen: room.votes[self.id] ?? null,
      submitted: self.id in room.votes,
      voted: all.filter((p) => p.alive && p.id in room.votes).map((p) => p.id),
      votes: room.settings.publicVotes
        ? all.filter((p) => p.alive && p.id in room.votes).map((p) => ({ voterId: p.id, targetId: room.votes[p.id] ?? null }))
        : null,
    };
  }

  return {
    code: room.code,
    phase: room.phase,
    day: room.day,
    phaseEndsAt: room.phaseEndsAt,
    paused: room.paused,
    pausedMs: room.paused ? room.pausedMs : null,
    serverNow: opts.now ?? 0,
    selfId: self.id,
    hostId: room.hostId,
    minPlayers: opts.minPlayers ?? MIN_PLAYERS,
    maxPlayers: opts.maxPlayers ?? MAX_PLAYERS,
    settings: room.settings,
    players: all.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      connected: p.connected,
      isHost: p.id === room.hostId,
      revealedRole: gameOver || (!p.alive && room.settings.revealOnDeath) ? p.role : null,
    })),
    morning: room.morning,
    winner: room.winner,
    night,
    voting,
    elimination: room.elimination
      ? { ...room.elimination, votes: room.settings.publicVotes ? room.elimination.votes : [] }
      : null,
    you: {
      role: self.role,
      team: self.role ? ROLES[self.role].team : null,
      teammates,
      investigations: room.investigations
        .filter((i) => i.detectiveId === self.id)
        .map((i) => ({ day: i.day, targetId: i.targetId, isMafia: i.isMafia })),
    },
  };
}
