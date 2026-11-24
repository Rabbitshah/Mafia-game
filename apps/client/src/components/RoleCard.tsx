import { useEffect, useState } from 'react';
import { ROLES, type PlayerView } from '@mafia/shared';

export default function RoleCard({ view, small = false }: { view: PlayerView; small?: boolean }) {
  const [held, setHeld] = useState(false);
  const role = view.you.role ? ROLES[view.you.role] : null;
  const isMafia = view.you.team === 'mafia';

  // Hide the card again if the tab loses focus mid-hold (e.g. a notification pulls down).
  useEffect(() => {
    const hide = () => setHeld(false);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Hold to reveal your role"
        className={`no-select flex flex-col items-center justify-center gap-3 rounded-3xl border-2 p-4 text-center transition-colors ${
          small ? 'h-24 w-full flex-row' : 'aspect-[3/4] w-64 p-6'
        } ${
          held
            ? isMafia
              ? 'border-red-500 bg-red-950'
              : 'border-emerald-500 bg-emerald-950'
            : 'border-neutral-700 bg-neutral-900'
        }`}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {held && role ? (
          small ? (
            <span className="text-xl font-black">
              {role.name} <span className="text-sm font-normal text-neutral-300">(Team {isMafia ? 'Mafia' : 'Town'})</span>
            </span>
          ) : (
            <>
              <span className="text-4xl font-black">{role.name}</span>
              <span className="text-sm uppercase tracking-widest text-neutral-300">
                Team {isMafia ? 'Mafia' : 'Town'}
              </span>
              <span className="text-neutral-200">{role.blurb}</span>
            </>
          )
        ) : (
          <span className={small ? 'text-neutral-400' : 'text-6xl'} aria-hidden={!small}>
            {small ? 'Hold to see your role' : '?'}
          </span>
        )}
      </button>

      {held && isMafia && (
        <p className="text-center text-red-300">
          {view.you.teammates.length > 0
            ? `Your team: ${view.you.teammates.map((t) => t.name).join(', ')}`
            : 'You are the only Mafia.'}
        </p>
      )}
    </>
  );
}
