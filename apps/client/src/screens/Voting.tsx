import { useState } from 'react';
import type { PlayerView } from '@mafia/shared';
import HostSkip from '../components/HostSkip';
import RoleCard from '../components/RoleCard';
import Timer from '../components/Timer';
import { errorText } from '../errors';

export default function Voting({
  view,
  onVote,
  onSkip,
}: {
  view: PlayerView;
  onVote: (target: string | null) => Promise<string | null>;
  onSkip: () => Promise<string | null>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const v = view.voting;
  if (!v) return null;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const alive = view.players.filter((p) => p.alive);
  const waiting = alive.filter((p) => !v.voted.includes(p.id));
  const countFor = (id: string) => v.votes?.filter((x) => x.targetId === id).length ?? 0;

  const cast = async (target: string | null) => {
    const e = await onVote(target);
    setErr(e ? errorText(e) : null);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-6">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold">{v.round === 2 ? 'Runoff vote' : 'Vote'}</h1>
        <Timer view={view} />
      </header>

      <p className="text-neutral-300">
        {!v.canVote
          ? 'You are dead. You can watch but not vote.'
          : v.round === 2
            ? 'It was a tie. Pick one of the tied players.'
            : 'Who do you think is Mafia?'}
      </p>

      <ul className="flex flex-col gap-2">
        {v.candidates
          .filter((c) => c.id !== view.selfId)
          .map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={!v.canVote}
                className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left disabled:opacity-60 ${
                  v.chosen === c.id ? 'border-amber-400 bg-amber-950' : 'border-neutral-800 bg-neutral-900'
                }`}
                onClick={() => cast(c.id)}
              >
                <span>{c.name}</span>
                {v.votes && <span className="text-sm text-neutral-400">{countFor(c.id)}</span>}
              </button>
            </li>
          ))}
        {v.canVote && (
          <li>
            <button
              type="button"
              className={`w-full rounded-xl border-2 px-4 py-3 text-left text-neutral-300 ${
                v.submitted && v.chosen === null ? 'border-amber-400 bg-amber-950' : 'border-neutral-800 bg-neutral-900'
              }`}
              onClick={() => cast(null)}
            >
              Skip (vote for nobody)
            </button>
          </li>
        )}
      </ul>

      {v.votes && v.votes.length > 0 && (
        <div className="rounded-xl bg-neutral-900 p-3 text-sm text-neutral-300">
          {v.votes.map((x) => (
            <p key={x.voterId}>
              {nameOf(x.voterId)} → {x.targetId ? nameOf(x.targetId) : 'nobody'}
            </p>
          ))}
        </div>
      )}

      <p className="text-sm text-neutral-400">
        {waiting.length === 0 ? 'Everyone has voted.' : `Waiting for: ${waiting.map((p) => p.name).join(', ')}`}
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="mt-auto flex flex-col gap-3 pb-2">
        <RoleCard view={view} small />
        <HostSkip view={view} onSkip={onSkip} />
      </div>
    </main>
  );
}
