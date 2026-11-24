import { ROLES, type PlayerView } from '@mafia/shared';
import HostSkip from '../components/HostSkip';
import Timer from '../components/Timer';

export default function Elimination({ view, onSkip }: { view: PlayerView; onSkip: () => Promise<string | null> }) {
  const e = view.elimination;
  const out = e?.eliminatedId ? view.players.find((p) => p.id === e.eliminatedId) : undefined;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-6 p-6">
      <header className="flex w-full items-center justify-between pt-2">
        <h1 className="text-2xl font-bold">Vote result</h1>
        <Timer view={view} />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {out ? (
          <>
            <p className="text-3xl font-black">{out.name} was voted out.</p>
            {out.revealedRole && <p className="text-neutral-300">They were {ROLES[out.revealedRole].name}.</p>}
          </>
        ) : e?.outcome === 'tie' ? (
          <p className="text-3xl font-black">Tie. Nobody was voted out.</p>
        ) : (
          <p className="text-3xl font-black">No votes. Nobody was voted out.</p>
        )}

        {e && e.tally.length > 0 && (
          <ul className="mt-4 text-sm text-neutral-300">
            {e.tally.map((t) => (
              <li key={t.targetId}>
                {nameOf(t.targetId)}: {t.count}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-neutral-500">Night falls next.</p>
      </section>

      <HostSkip view={view} onSkip={onSkip} />
    </main>
  );
}
