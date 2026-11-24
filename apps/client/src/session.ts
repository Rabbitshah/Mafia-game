import type { Creds } from '@mafia/shared';

// In dev, sessionStorage makes every browser tab a separate player.
// In production, localStorage keeps your seat across refreshes and phone locks.
const store = (): Storage => (import.meta.env.DEV ? sessionStorage : localStorage);
const KEY = 'mafia:session';
const NAME_KEY = 'mafia:name';

export function loadSession(): Creds | null {
  try {
    const raw = store().getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Creds>;
    return v.code && v.playerId && v.token ? (v as Creds) : null;
  } catch {
    return null;
  }
}

export function saveSession(creds: Creds): void {
  try {
    store().setItem(KEY, JSON.stringify(creds));
  } catch {
    /* storage can be blocked; the game still works until refresh */
  }
}

export function clearSession(): void {
  try {
    store().removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
