import { useState } from 'react';
import { ROLES, type PlayerView } from '@mafia/shared';
import { errorText } from '../errors';

export default function GameOver({
  view,
  onLeave,
  onRematch,
}: {
  view: PlayerView;
  onLeave: () => void;
  onRematch: () => Promise<string | null>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const isHost = view.selfId === view.hostId;
  const townWon = view.winner === 'town';
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-6">
      <header className="pt-4 text-center">
        <h1 className={`text-4xl font-black ${townWon ? 'text-emerald-400' : 'text-red-400'}`}>
          {townWon ? 'Town wins' : 'Mafia wins'}
        </h1>
      </header>

      <ul className="flex flex-col gap-2">
        {view.players.map((p) => (
          <li key={p.id} className="flex justify-between rounded-xl bg-neutral-900 px-4 py-3">
            <span className={p.alive ? '' : 'text-neutral-500 line-through'}>{p.name}</span>
            <span className="text-neutral-300">{p.revealedRole ? ROLES[p.revealedRole].name : '?'}</span>
          </li>
        ))}
      </ul>

      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="mt-auto flex flex-col gap-3">
        {isHost ? (
          <button
            type="button"
            className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold"
            onClick={async () => {
              const e = await onRematch();
              setErr(e ? errorText(e) : null);
            }}
          >
            Play again
          </button>
        ) : (
          <p className="text-center text-sm text-neutral-400">Waiting for the host to start another game.</p>
        )}
        <button type="button" className="rounded-xl bg-neutral-800 px-4 py-3" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </main>
  );
}
