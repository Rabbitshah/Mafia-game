import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@mafia/shared';

/** Seconds left in the phase. Uses the server clock so a wrong phone clock does not matter. */
export function useCountdown(view: PlayerView): number | null {
  // offset = serverNow - localNow, fixed at the moment each snapshot arrives.
  // It must only change when a new snapshot arrives, or elapsed time cancels out and the clock never ticks.
  const offset = useRef(view.serverNow - Date.now());
  const lastServerNow = useRef(view.serverNow);
  if (view.serverNow !== lastServerNow.current) {
    lastServerNow.current = view.serverNow;
    offset.current = view.serverNow - Date.now();
  }
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Paused: the clock is frozen at the time that was left.
  if (view.paused && view.pausedMs !== null) return Math.ceil(view.pausedMs / 1000);
  if (view.phaseEndsAt === null) return null;
  return Math.max(0, Math.ceil((view.phaseEndsAt - (Date.now() + offset.current)) / 1000));
}
