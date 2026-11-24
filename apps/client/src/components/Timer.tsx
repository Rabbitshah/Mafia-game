import type { PlayerView } from '@mafia/shared';
import { useCountdown } from '../useCountdown';

export default function Timer({ view }: { view: PlayerView }) {
  const left = useCountdown(view);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span aria-label="Time left" className="rounded-full bg-neutral-900 px-3 py-1 font-mono text-sm">
      {m}:{s}
    </span>
  );
}
