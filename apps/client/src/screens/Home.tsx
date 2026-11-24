import { useState } from 'react';
import { MAX_NAME_LENGTH } from '@mafia/shared';
import { errorText } from '../errors';
import { loadName, saveName } from '../session';

interface Props {
  onCreate: (name: string) => Promise<string | null>;
  onJoin: (code: string, name: string) => Promise<string | null>;
}

export default function Home({ onCreate, onJoin }: Props) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    saveName(name.trim());
    const err = await fn();
    if (err) setError(errorText(err));
    else history.replaceState(null, '', location.pathname); // drop ?room= from the URL
    setBusy(false);
  };

  const field =
    'w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-lg outline-none focus:border-red-600';
  const primary =
    'w-full rounded-xl bg-red-700 active:bg-red-800 disabled:opacity-40 px-4 py-3 text-lg font-semibold';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-4xl font-black tracking-tight">Mafia Night</h1>
        <p className="mt-1 text-neutral-400">Night falls. Trust no one.</p>
      </header>

      <input
        className={field}
        placeholder="Your name"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => setName(e.target.value)}
        autoComplete="nickname"
      />

      <section className="flex flex-col gap-3">
        <input
          className={`${field} text-center font-mono uppercase tracking-[0.4em]`}
          placeholder="ROOM CODE"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        <button
          className={primary}
          disabled={busy || !name.trim() || code.length !== 6}
          onClick={() => run(() => onJoin(code, name))}
        >
          Join room
        </button>
      </section>

      <div className="flex items-center gap-3 text-sm text-neutral-500">
        <span className="h-px flex-1 bg-neutral-800" /> or <span className="h-px flex-1 bg-neutral-800" />
      </div>

      <button
        className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-lg font-semibold active:bg-neutral-900 disabled:opacity-40"
        disabled={busy || !name.trim()}
        onClick={() => run(() => onCreate(name))}
      >
        Create a new room
      </button>

      {error && (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-center text-red-200">
          {error}
        </p>
      )}
    </main>
  );
}
