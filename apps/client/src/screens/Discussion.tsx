import type { PlayerView } from '@mafia/shared';
import { ROLES } from '@mafia/shared';
import HostSkip from '../components/HostSkip';
import RoleCard from '../components/RoleCard';
import Timer from '../components/Timer';

export default function Discussion({ view, onSkip }: { view: PlayerView; onSkip: () => Promise<string | null> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-6">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold">Day {view.day}: discuss</h1>
        <Timer view={view} />
      </header>

      <ul className="flex flex-col gap-2">
        {view.players.map((p) => (
          <li key={p.id} className={`rounded-xl bg-neutral-900 px-4 py-3 ${p.alive ? '' : 'text-neutral-500 line-through'}`}>
            {p.name}
            {!p.alive && p.revealedRole && ` (${ROLES[p.revealedRole].name})`}
          </li>
        ))}
      </ul>

      <p className="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-300">
        Talk it out. Voting starts when the timer ends.
      </p>

      <div className="mt-auto flex flex-col gap-3 pb-2">
        <RoleCard view={view} small />
        <HostSkip view={view} onSkip={onSkip} />
      </div>
    </main>
  );
}
