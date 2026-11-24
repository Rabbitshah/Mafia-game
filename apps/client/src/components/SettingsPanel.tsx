import { useState } from 'react';
import { TIMER_LIMITS, type PlayerView } from '@mafia/shared';
import { errorText } from '../errors';

const TIMER_LABELS: Record<keyof typeof TIMER_LIMITS, string> = {
  roleRevealSec: 'Role reveal',
  nightSec: 'Night',
  morningSec: 'Morning',
  discussionSec: 'Discussion',
  voteSec: 'Vote',
  eliminationSec: 'Vote result',
};

export default function SettingsPanel({
  view,
  onChange,
}: {
  view: PlayerView;
  onChange: (patch: Record<string, unknown>) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetN, setResetN] = useState(0);
  const s = view.settings;

  const apply = async (patch: Record<string, unknown>) => {
    const e = await onChange(patch);
    setError(e ? errorText(e) : null);
    if (e) setResetN((n) => n + 1); // drop the refused value from the box
  };

  return (
    <section className="rounded-xl border border-neutral-800 p-4">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>Game settings</span>
        <span className="text-neutral-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <h3 className="text-xs uppercase tracking-widest text-neutral-400">Timers (seconds)</h3>
          {(Object.keys(TIMER_LIMITS) as (keyof typeof TIMER_LIMITS)[]).map((key) => {
            const [min, max] = TIMER_LIMITS[key];
            return (
              <label key={key} className="flex items-center justify-between gap-3">
                <span>{TIMER_LABELS[key]}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={min}
                  max={max}
                  defaultValue={s[key]}
                  key={`${key}-${s[key]}-${resetN}`}
                  aria-label={`${TIMER_LABELS[key]} seconds (${min} to ${max})`}
                  className="w-24 rounded-lg bg-neutral-900 px-3 py-2 text-right"
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== s[key]) apply({ [key]: v });
                  }}
                />
              </label>
            );
          })}

          <h3 className="mt-2 text-xs uppercase tracking-widest text-neutral-400">Rules</h3>
          <label className="flex items-center justify-between gap-3">
            <span>If the vote ties</span>
            <select
              className="rounded-lg bg-neutral-900 px-3 py-2"
              value={s.tieRule}
              onChange={(e) => apply({ tieRule: e.target.value })}
            >
              <option value="runoff">Runoff vote</option>
              <option value="random">Pick at random</option>
              <option value="none">Nobody out</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Doctor saves self</span>
            <select
              className="rounded-lg bg-neutral-900 px-3 py-2"
              value={s.doctorSelfSave}
              onChange={(e) => apply({ doctorSelfSave: e.target.value })}
            >
              <option value="once">Once</option>
              <option value="always">Any night except two in a row</option>
              <option value="never">Never</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span>Show who voted for whom</span>
            <input type="checkbox" className="h-6 w-6" checked={s.publicVotes} onChange={(e) => apply({ publicVotes: e.target.checked })} />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span>Reveal role when someone dies</span>
            <input type="checkbox" className="h-6 w-6" checked={s.revealOnDeath} onChange={(e) => apply({ revealOnDeath: e.target.checked })} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
