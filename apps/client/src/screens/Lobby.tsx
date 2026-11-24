import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { maxMafiaFor, mafiaCountFor, type PlayerView } from '@mafia/shared';
import { errorText } from '../errors';
import SettingsPanel from '../components/SettingsPanel';
import { serverUrl } from '../socket';

interface Props {
  view: PlayerView;
  onStart: () => Promise<string | null>;
  onLeave: () => void;
  onMafiaCount: (v: number | 'auto') => Promise<string | null>;
  onSettings: (patch: Record<string, unknown>) => Promise<string | null>;
  onKick: (playerId: string) => Promise<string | null>;
}

export default function Lobby({ view, onStart, onLeave, onMafiaCount, onSettings, onKick }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isHost = view.selfId === view.hostId;
  const n = view.players.length;
  const enough = n >= view.minPlayers;
  // On localhost the QR would open "localhost" on a phone, so ask the dev server for its Wi-Fi address.
  const [lanHost, setLanHost] = useState<string | null>(null);
  useEffect(() => {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
    fetch(`${serverUrl}/lan`).then((r) => r.json()).then((d) => setLanHost(d.ip)).catch(() => {});
  }, []);
  const origin = lanHost ? `${location.protocol}//${lanHost}:${location.port}` : location.origin;
  const link = `${origin}/?room=${view.code}`;

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Mafia Night', text: `Join my Mafia game: ${view.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* user cancelled share */
    }
  };

  const guard = async (fn: () => Promise<string | null>) => {
    setError(null);
    const err = await fn();
    if (err) setError(errorText(err));
  };

  const autoCount = mafiaCountFor(n);
  const maxCount = maxMafiaFor(Math.max(n, view.minPlayers));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-6">
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <p className="text-sm uppercase tracking-widest text-neutral-400">Room code</p>
        <p className="font-mono text-5xl font-black tracking-[0.3em]" aria-label={`Room code ${view.code.split('').join(' ')}`}>
          {view.code}
        </p>
        <div className="rounded-lg bg-white p-2">
          <QRCode value={link} size={132} />
        </div>
        <button className="rounded-lg border border-neutral-700 px-4 py-2 active:bg-neutral-800" onClick={share}>
          {copied ? 'Link copied' : 'Share invite link'}
        </button>
      </section>

      <section>
        <h2 className="mb-2 flex justify-between text-sm uppercase tracking-widest text-neutral-400">
          <span>Players</span>
          <span>
            {n} / {view.maxPlayers}
          </span>
        </h2>
        <ul className="flex flex-col gap-2">
          {view.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-neutral-900 px-4 py-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${p.connected ? 'bg-green-500' : 'bg-neutral-600'}`}
                title={p.connected ? 'Online' : 'Reconnecting'}
              />
              <span className="flex-1 truncate text-lg">
                {p.name}
                {p.id === view.selfId && <span className="text-neutral-500"> (you)</span>}
              </span>
              {p.isHost && <span className="rounded bg-red-900 px-2 py-0.5 text-xs font-semibold">HOST</span>}
              {isHost && p.id !== view.selfId && (
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  className="min-h-11 rounded-lg border border-neutral-700 px-3 text-sm text-neutral-300"
                  onClick={() => guard(() => onKick(p.id))}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isHost && (
        <section className="rounded-xl border border-neutral-800 p-4">
          <label className="flex items-center justify-between gap-3">
            <span>Mafia count</span>
            <select
              className="rounded-lg bg-neutral-900 px-3 py-2"
              value={String(view.settings.mafiaCount)}
              onChange={(e) => guard(() => onMafiaCount(e.target.value === 'auto' ? 'auto' : Number(e.target.value)))}
            >
              <option value="auto">Auto ({autoCount} now)</option>
              {Array.from({ length: maxCount }, (_, i) => i + 1).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {isHost && <SettingsPanel view={view} onChange={onSettings} />}

      {error && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-center text-red-200">
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3 pb-2">
        {isHost ? (
          <button
            className="w-full rounded-xl bg-red-700 px-4 py-4 text-xl font-bold active:bg-red-800 disabled:opacity-40"
            disabled={!enough}
            onClick={() => guard(onStart)}
          >
            {enough ? 'Start game' : `Need ${view.minPlayers - n} more player${view.minPlayers - n === 1 ? '' : 's'}`}
          </button>
        ) : (
          <p className="text-center text-neutral-400">Waiting for the host to start...</p>
        )}
        <button className="text-neutral-500 underline" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </main>
  );
}
