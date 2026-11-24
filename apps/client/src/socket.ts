import { io } from 'socket.io-client';
import type { Ack } from '@mafia/shared';

export const serverUrl = import.meta.env.VITE_SERVER_URL || `${location.protocol}//${location.hostname}:3001`;

export const socket = io(serverUrl, { autoConnect: false });

/** Emit an event and wait for the server ack. Fails after 6 seconds. */
export function emitAck<T extends object = object>(event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 6000);
    socket.emit(event, payload, (res: Ack<T>) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}
