const MESSAGES: Record<string, string> = {
  INVALID_NAME: 'Enter a name (1 to 20 characters).',
  NAME_TAKEN: 'That name is already in the room. Pick another.',
  NO_SUCH_ROOM: 'No room with that code.',
  ROOM_FULL: 'This room is full (15 players).',
  GAME_STARTED: 'That game already started.',
  NOT_HOST: 'Only the host can do that.',
  NOT_ENOUGH_PLAYERS: 'Not enough players yet.',
  NOT_IN_LOBBY: 'The game already started.',
  BAD_SETTINGS: 'That setting is not allowed.',
  WRONG_PHASE: 'Not possible right now.',
  NOT_ALIVE: 'Dead players cannot do that.',
  NO_NIGHT_ACTION: 'Your role has no night action.',
  INVALID_TARGET: 'Pick a valid player.',
  NOT_FINISHED: 'The game is not over yet.',
  PAUSED: 'The host paused the game.',
  NOT_PAUSABLE: 'Nothing to pause right now.',
  RATE_LIMIT: 'Slow down a little and try again.',
  SERVER_BUSY: 'Server is full right now. Try again soon.',
  ALREADY_IN_ROOM: 'You are already in a room.',
  TIMEOUT: 'Server did not answer. It may be waking up (free hosting). Try again in a minute.',
};

export const errorText = (code: string): string => MESSAGES[code] ?? 'Something went wrong. Try again.';
