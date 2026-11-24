export type Phase =
  | 'LOBBY'
  | 'ROLE_REVEAL'
  | 'NIGHT'
  | 'MORNING'
  | 'DISCUSSION'
  | 'VOTING'
  | 'RUNOFF'
  | 'ELIMINATION'
  | 'GAME_OVER';

export type RoleId = 'mafia' | 'doctor' | 'detective' | 'villager';
export type Team = 'town' | 'mafia';

export interface Settings {
  /** 'auto' picks a count from the player total. */
  mafiaCount: number | 'auto';
  roleRevealSec: number;
  morningSec: number;
  eliminationSec: number;
  discussionSec: number;
  voteSec: number;
  nightSec: number;
  doctorSelfSave: 'always' | 'once' | 'never';
  revealOnDeath: boolean;
  tieRule: 'runoff' | 'none' | 'random';
  publicVotes: boolean;
}

/** Server-side player. `role`, `tokenHash` and `socketId` must never reach a client. */
export interface Player {
  id: string;
  tokenHash: string;
  name: string;
  socketId: string | null;
  role: RoleId | null;
  alive: boolean;
  connected: boolean;
}

/** A Detective's private finding. Only the Detective who made it may see it. */
export interface Investigation {
  day: number;
  detectiveId: string;
  targetId: string;
  isMafia: boolean;
}

/** Public result of the last night: who died (empty means nobody, no reason given). */
export interface MorningSummary {
  day: number;
  deathIds: string[];
}

/** Public result of a day vote. */
export interface EliminationSummary {
  day: number;
  outcome: 'eliminated' | 'tie' | 'no_votes';
  eliminatedId: string | null;
  tally: { targetId: string; count: number }[];
  /** Who voted for whom. Server keeps it; clients only get it when `publicVotes` is on. */
  votes: { voterId: string; targetId: string | null }[];
}

/** Server-side room. Never send this to a client. Use `getStateFor`. */
export interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  day: number;
  phaseEndsAt: number | null;
  players: Map<string, Player>;
  settings: Settings;
  /** Night choices: actorId -> targetId (null = chose nobody). Latest choice wins until the night ends. */
  nightActions: Record<string, string | null>;
  doctorSelfSaveUsed: boolean;
  lastProtectedId: string | null;
  investigations: Investigation[];
  morning: MorningSummary | null;
  /** Day votes: voterId -> targetId (null = abstain). Latest choice wins until the vote ends. */
  votes: Record<string, string | null>;
  /** Set during RUNOFF: the only players who can be voted for. */
  runoffCandidates: string[];
  elimination: EliminationSummary | null;
  /** Host paused the clock. `pausedMs` is the time that was left in the phase. */
  paused: boolean;
  pausedMs: number | null;
  winner: Team | null;
  createdAt: number;
  lastActivityAt: number;
}

// ---- What a client is allowed to see ----

export interface PublicPlayer {
  id: string;
  name: string;
  alive: boolean;
  connected: boolean;
  isHost: boolean;
  /** Only set for dead players when "reveal on death" is on, and for everyone at GAME_OVER. */
  revealedRole: RoleId | null;
}

export interface NightView {
  /** Players you may pick tonight. */
  targets: { id: string; name: string }[];
  /** Your current pick (null = nobody). */
  chosen: string | null;
  submitted: boolean;
  /** Mafia only: what your teammates have picked so far. */
  teammateVotes: { voterId: string; voterName: string; targetId: string | null }[];
}

export interface VotingView {
  round: 1 | 2;
  candidates: { id: string; name: string }[];
  /** False for dead players: they watch only. */
  canVote: boolean;
  chosen: string | null;
  submitted: boolean;
  /** Ids of players who have locked in (not who they picked). */
  voted: string[];
  /** Live picks. Only present when the `publicVotes` setting is on. */
  votes: { voterId: string; targetId: string | null }[] | null;
}

export interface PlayerView {
  code: string;
  phase: Phase;
  day: number;
  phaseEndsAt: number | null;
  paused: boolean;
  /** Time left in ms while paused, else null. */
  pausedMs: number | null;
  /** Server clock at send time, so phones with a wrong clock can still show a right countdown. */
  serverNow: number;
  selfId: string;
  hostId: string;
  minPlayers: number;
  maxPlayers: number;
  settings: Settings;
  players: PublicPlayer[];
  morning: MorningSummary | null;
  winner: Team | null;
  /** Set only while it is night and you are alive with a night power. */
  night: NightView | null;
  /** Set during VOTING and RUNOFF. */
  voting: VotingView | null;
  /** Result of the latest vote. */
  elimination: EliminationSummary | null;
  you: {
    role: RoleId | null;
    team: Team | null;
    /** Fellow mafia members (excluding you). Empty for everyone else. */
    teammates: { id: string; name: string }[];
    /** Your own findings. Only a Detective ever has any. */
    investigations: { day: number; targetId: string; isMafia: boolean }[];
  };
}

// ---- Socket protocol ----

export interface Creds {
  code: string;
  playerId: string;
  token: string;
}

export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
