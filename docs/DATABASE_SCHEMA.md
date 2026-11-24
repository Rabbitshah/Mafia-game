# Database Schema Specification

**Candid note:** v1 has **no database**. Games are short, accounts do not exist, and in-memory state is enough. This file fixes the **data model** now so a database in v3 (game history) does not force a rewrite.

## Part A: Runtime model (v1, in memory, TypeScript)
```ts
type Phase = 'LOBBY'|'ROLE_REVEAL'|'NIGHT'|'MORNING'|'DISCUSSION'|'VOTING'|'RUNOFF'|'ELIMINATION'|'GAME_OVER';
type RoleId = 'mafia'|'doctor'|'detective'|'villager'|'jester'|'godfather'|'bodyguard'|'vigilante';

interface Player {
  id: string;            // playerId, uuid, stable identity
  tokenHash: string;     // hash of secret rejoin token
  name: string;          // 1..20 chars
  socketId: string|null; // null when disconnected
  role: RoleId|null;     // SERVER ONLY
  alive: boolean;
  connected: boolean;
  usedAbilities: Record<string, number>; // e.g. doctorSelfSave
}

interface Room {
  code: string;          // 6 chars, unambiguous alphabet
  hostId: string;
  phase: Phase;
  day: number;
  phaseEndsAt: number|null; // epoch ms
  players: Map<string, Player>;
  nightActions: Record<string, {actorId: string; target: string|null}>;
  votes: Record<string, string|null>; // voterId -> targetId
  settings: Settings;
  log: GameEvent[];      // public log, no secrets until game over
  createdAt: number; lastActivityAt: number;
}

interface Settings {
  mafiaCount: number; enabledRoles: RoleId[];
  discussionSec: number; voteSec: number; nightSec: number;
  doctorSelfSave: 'always'|'once'|'never';
  revealOnDeath: boolean; tieRule: 'runoff'|'none'|'random';
  publicVotes: boolean;
}
```
Rules: `role` and `nightActions` never leave the server except through `getStateFor`.

## Part B: Optional Postgres schema (v3, history and stats)
Use Supabase or Neon. Only completed games are written. Nothing is read during play.

| Table | Columns | Notes |
|---|---|---|
| `profiles` | `id uuid pk`, `display_name text not null`, `created_at timestamptz` | Only if accounts are added |
| `games` | `id uuid pk`, `room_code text`, `started_at`, `ended_at`, `winner text check in ('town','mafia','jester')`, `settings jsonb`, `days int` | One row per game |
| `game_players` | `id uuid pk`, `game_id uuid fk games`, `profile_id uuid fk profiles null`, `name text`, `role text`, `survived bool`, `died_day int null`, `died_by text null` | Unique `(game_id, name)` |
| `game_events` | `id bigserial pk`, `game_id uuid fk`, `day int`, `phase text`, `type text`, `payload jsonb`, `at timestamptz` | Append-only timeline |

Relationships: `games 1-N game_players`, `games 1-N game_events`, `profiles 1-N game_players` (nullable).
Indexes: `game_players(profile_id)`, `game_events(game_id, at)`.
RLS: if using Supabase, all tables read-only to authenticated users, writes only by server service key.

## Auth flows
| Version | Flow |
|---|---|
| v1 | No login. Server issues `playerId` and `token` on join. Stored in `localStorage`. Rejoin proves ownership of the seat. |
| v3 (optional) | Magic link or Google login via Supabase Auth to attach history to a profile. Game play still works without login. |

## Migration rule
Add columns, do not rename. Keep `settings` and `payload` as `jsonb` so new roles and rules need no migration.
