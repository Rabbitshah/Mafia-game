import { useCallback, useEffect, useState } from 'react';
import type { Ack, Creds, PlayerView } from '@mafia/shared';
import { clearSession, loadSession, saveSession } from './session';
import { emitAck, socket } from './socket';

export type Status = 'connecting' | 'online' | 'offline';

export function useGame() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  // True while we are trying to restore a saved seat, so the home screen does not flash.
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<boolean>(() => loadSession() !== null);

  useEffect(() => {
    const onSnapshot = (v: PlayerView) => setView(v);

    const onConnect = async () => {
      setStatus('online');
      const saved = loadSession();
      if (!saved) {
        setRestoring(false);
        return;
      }
      const res = await emitAck('room:rejoin', saved);
      if (!res.ok) {
        clearSession();
        setView(null);
      }
      setRestoring(false);
    };

    const onKicked = () => {
      clearSession();
      setView(null);
      setNotice('The host removed you from the room.');
      socket.emit('room:leave', undefined, () => {}); // lets this connection join or create again
    };

    const onDisconnect = () => setStatus('offline');

    // Phones freeze background tabs. On return, reconnect or ask for a fresh snapshot.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      else if (loadSession()) socket.emit('state:request', undefined, () => {});
    };

    socket.on('state:snapshot', onSnapshot);
    socket.on('connect', onConnect);
    socket.on('room:kicked', onKicked);
    socket.on('disconnect', onDisconnect);
    document.addEventListener('visibilitychange', onVisible);
    socket.connect();

    return () => {
      socket.off('state:snapshot', onSnapshot);
      socket.off('connect', onConnect);
      socket.off('room:kicked', onKicked);
      socket.off('disconnect', onDisconnect);
      document.removeEventListener('visibilitychange', onVisible);
      socket.disconnect();
    };
  }, []);

  const enter = useCallback(async (event: 'room:create' | 'room:join', payload: unknown): Promise<string | null> => {
    const res: Ack<Creds> = await emitAck<Creds>(event, payload);
    if (!res.ok) return res.error;
    saveSession({ code: res.code, playerId: res.playerId, token: res.token });
    return null;
  }, []);

  const create = useCallback((name: string) => enter('room:create', { name }), [enter]);
  const join = useCallback((code: string, name: string) => enter('room:join', { code, name }), [enter]);

  const leave = useCallback(async () => {
    await emitAck('room:leave');
    clearSession();
    setView(null);
  }, []);

  const start = useCallback(async (): Promise<string | null> => {
    const res = await emitAck('host:start');
    return res.ok ? null : res.error;
  }, []);

  const setMafiaCount = useCallback(async (mafiaCount: number | 'auto'): Promise<string | null> => {
    const res = await emitAck('host:settings', { mafiaCount });
    return res.ok ? null : res.error;
  }, []);

  const nightAction = useCallback(async (target: string | null): Promise<string | null> => {
    const res = await emitAck('night:action', { target });
    return res.ok ? null : res.error;
  }, []);

  const skip = useCallback(async (): Promise<string | null> => {
    const res = await emitAck('host:skip');
    return res.ok ? null : res.error;
  }, []);

  const castVote = useCallback(async (target: string | null): Promise<string | null> => {
    const res = await emitAck('vote:cast', { target });
    return res.ok ? null : res.error;
  }, []);

  const rematch = useCallback(async (): Promise<string | null> => {
    const res = await emitAck('host:rematch');
    return res.ok ? null : res.error;
  }, []);

  const updateSettings = useCallback(async (patch: Record<string, unknown>): Promise<string | null> => {
    const res = await emitAck('host:settings', patch);
    return res.ok ? null : res.error;
  }, []);

  const kick = useCallback(async (target: string): Promise<string | null> => {
    const res = await emitAck('host:kick', { target });
    return res.ok ? null : res.error;
  }, []);

  const pause = useCallback(async (): Promise<string | null> => {
    const res = await emitAck('host:pause');
    return res.ok ? null : res.error;
  }, []);

  return { view, status, restoring, notice, dismissNotice: () => setNotice(null), updateSettings, kick, pause, create, join, leave, start, setMafiaCount, nightAction, skip, castVote, rematch };
}
