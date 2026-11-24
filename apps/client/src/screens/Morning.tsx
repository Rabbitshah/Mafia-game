import { ROLES, type PlayerView } from '@mafia/shared';
import HostSkip from '../components/HostSkip';
import Timer from '../components/Timer';

export default function Morning({ view, onSkip }: { view: PlayerView; onSkip: () => Promise<string | null> }) {
  const deaths = (view.morning?.deathIds ?? [])
    .map((id) => view.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-6 p-6">
      <header className="flex w-full items-center justify-between pt-2">
        <h1 className="text-2xl font-bold">Morning {view.day}</h1>
        <Timer view={view} />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        {deaths.length === 0 ? (
          <p className="text-3xl font-black">Nobody died.</p>
        ) : (
          deaths.map((p) => (
            <div key={p.id}>
              <p className="text-3xl font-black">{p.name} was killed.</p>
              {p.revealedRole && <p className="text-neutral-300">They were {ROLES[p.revealedRole].name}.</p>}
            </div>
          ))
        )}
      </section>

      <HostSkip view={view} onSkip={onSkip} />
    </main>
  );
}
