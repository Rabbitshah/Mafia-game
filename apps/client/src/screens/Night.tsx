import { useState } from 'react';
import { ROLES, type PlayerView } from '@mafia/shared';
import HostSkip from '../components/HostSkip';
import RoleCard from '../components/RoleCard';
import Timer from '../components/Timer';
import { errorText } from '../errors';

const PROMPT: Record<string, string> = {
  mafia: 'Choose who to kill.',
  doctor: 'Choose who to protect.',
  detective: 'Choose who to investigate.',
};

export default function Night({
  view,
  onAction,
  onSkip,
}: {
  view: PlayerView;
  onAction: (target: string | null) => Promise<string | null>;
  onSkip: () => Promise<string | null>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const me = view.players.find((p) => p.id === view.selfId);
  const alive = me?.alive ?? false;
  const night = view.night;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';

  const pick = async (target: string | null) => {
    const e = await onAction(target);
    setErr(e ? errorText(e) : null);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 bg-neutral-950 p-6">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold">Night {view.day}</h1>
        <Timer view={view} />
      </header>

      {!alive ? (
        <p className="rounded-xl bg-neutral-900 p-4 text-neutral-300">You are dead. Stay quiet and watch.</p>
      ) : night ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {ROLES[view.you.role!].name}: {PROMPT[view.you.role!]}
          </h2>

          <ul className="flex flex-col gap-2">
            {night.targets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl border-2 px-4 py-3 text-left ${
                    night.chosen === t.id ? 'border-amber-400 bg-amber-950' : 'border-neutral-800 bg-neutral-900'
                  }`}
                  onClick={() => pick(t.id)}
                >
                  {t.name}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={`w-full rounded-xl border-2 px-4 py-3 text-left text-neutral-300 ${
                  night.submitted && night.chosen === null ? 'border-amber-400 bg-amber-950' : 'border-neutral-800 bg-neutral-900'
                }`}
                onClick={() => pick(null)}
              >
                Nobody
              </button>
            </li>
          </ul>

          <p className="text-sm text-neutral-400">
            {night.submitted
              ? 'Locked in. You can still change it until the night ends.'
              : 'No choice yet. If time runs out, nothing happens.'}
          </p>

          {view.you.team === 'mafia' && night.teammateVotes.length > 0 && (
            <div className="rounded-xl bg-red-950 p-3 text-sm text-red-200">
              <p className="mb-1 font-semibold">Your team so far:</p>
              <ul>
                {night.teammateVotes.map((v) => (
                  <li key={v.voterId}>
                    {v.voterName}: {v.targetId ? nameOf(v.targetId) : 'nobody'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.you.role === 'detective' && view.you.investigations.length > 0 && (
            <div className="rounded-xl bg-neutral-900 p-3 text-sm">
              <p className="mb-1 font-semibold">Your findings:</p>
              <ul>
                {view.you.investigations.map((i) => (
                  <li key={i.day}>
                    Night {i.day}: {nameOf(i.targetId)} is {i.isMafia ? 'MAFIA' : 'not Mafia'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <p className="rounded-xl bg-neutral-900 p-4 text-neutral-300">
          Close your eyes. The night is happening. Wait for morning.
        </p>
      )}

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="mt-auto flex flex-col gap-3 pb-2">
        <RoleCard view={view} small />
        <HostSkip view={view} onSkip={onSkip} />
      </div>
    </main>
  );
}
