import { useState } from 'react';
import type { PlayerView } from '@mafia/shared';
import { errorText } from '../errors';
import { useHostActions } from './HostActions';

/** Host-only controls so a stuck or interrupted phase never blocks the table. */
export default function HostSkip({ view, onSkip }: { view: PlayerView; onSkip: () => Promise<string | null> }) {
  const [err, setErr] = useState<string | null>(null);
  const actions = useHostActions();
  if (view.selfId !== view.hostId) return null;
  const run = async (fn: () => Promise<string | null>) => {
    const e = await fn();
    setErr(e ? errorText(e) : null);
  };
  return (
    <div className="text-center">
      <div className="flex justify-center gap-2">
        {actions && (
          <button
            type="button"
            className="min-h-11 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
            onClick={() => run(actions.pause)}
          >
            {view.paused ? 'Resume (host)' : 'Pause (host)'}
          </button>
        )}
        <button
          type="button"
          className="min-h-11 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
          onClick={() => run(onSkip)}
        >
          Skip ahead (host)
        </button>
      </div>
      {err && <p className="mt-1 text-sm text-red-400">{err}</p>}
    </div>
  );
}
