import type { PlayerView } from '@mafia/shared';
import HostSkip from '../components/HostSkip';
import RoleCard from '../components/RoleCard';
import Timer from '../components/Timer';

export default function RoleReveal({ view, onSkip }: { view: PlayerView; onSkip: () => Promise<string | null> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-6 p-6">
      <header className="pt-4 text-center">
        <h1 className="text-2xl font-bold">Your secret role</h1>
        <p className="text-neutral-400">Press and hold the card. Let go to hide it.</p>
        <div className="mt-2">
          <Timer view={view} />
        </div>
      </header>

      <RoleCard view={view} />

      <section className="w-full">
        <h2 className="mb-2 text-sm uppercase tracking-widest text-neutral-400">At the table</h2>
        <ul className="flex flex-wrap gap-2">
          {view.players.map((p) => (
            <li
              key={p.id}
              className={`rounded-full px-3 py-1 text-sm ${p.connected ? 'bg-neutral-900' : 'bg-neutral-900 text-neutral-500'}`}
            >
              {p.name}
              {!p.connected && ' (away)'}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto pb-2">
        <HostSkip view={view} onSkip={onSkip} />
      </div>
    </main>
  );
}
