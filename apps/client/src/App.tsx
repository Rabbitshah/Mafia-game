import Home from './screens/Home';
import Lobby from './screens/Lobby';
import { HostActionsContext } from './components/HostActions';
import Discussion from './screens/Discussion';
import GameOver from './screens/GameOver';
import Morning from './screens/Morning';
import Night from './screens/Night';
import Voting from './screens/Voting';
import Elimination from './screens/Elimination';
import RoleReveal from './screens/RoleReveal';
import { useGame } from './useGame';
import { useWakeLock } from './useWakeLock';

export default function App() {
  const { view, status, restoring, create, join, leave, start, setMafiaCount, nightAction, skip, castVote, rematch, notice, dismissNotice, updateSettings, kick, pause } = useGame();
  useWakeLock(view !== null);

  let screen;
  if (restoring && !view) {
    screen = <p className="grid min-h-dvh place-items-center text-neutral-400">Reconnecting...</p>;
  } else if (!view) {
    screen = (
      <>
        {notice && (
          <div role="status" className="bg-amber-700 px-4 py-3 text-center text-sm font-medium">
            {notice}{' '}
            <button type="button" className="underline" onClick={dismissNotice}>
              Dismiss
            </button>
          </div>
        )}
        <Home onCreate={create} onJoin={join} />
      </>
    );
  } else if (view.phase === 'LOBBY') {
    screen = <Lobby view={view} onStart={start} onLeave={leave} onMafiaCount={setMafiaCount} onSettings={updateSettings} onKick={kick} />;
  } else if (view.phase === 'ROLE_REVEAL') {
    screen = <RoleReveal view={view} onSkip={skip} />;
  } else if (view.phase === 'NIGHT') {
    screen = <Night view={view} onAction={nightAction} onSkip={skip} />;
  } else if (view.phase === 'MORNING') {
    screen = <Morning view={view} onSkip={skip} />;
  } else if (view.phase === 'GAME_OVER') {
    screen = <GameOver view={view} onLeave={leave} onRematch={rematch} />;
  } else if (view.phase === 'VOTING' || view.phase === 'RUNOFF') {
    screen = <Voting view={view} onVote={castVote} onSkip={skip} />;
  } else if (view.phase === 'ELIMINATION') {
    screen = <Elimination view={view} onSkip={skip} />;
  } else {
    screen = <Discussion view={view} onSkip={skip} />;
  }

  return (
    <>
      {status === 'offline' && (
        <div role="status" className="sticky top-0 z-10 bg-amber-700 px-4 py-2 text-center text-sm font-medium">
          Connection lost. Reconnecting...
        </div>
      )}
      {view?.paused && (
        <div role="status" className="sticky top-0 z-10 bg-sky-800 px-4 py-2 text-center text-sm font-medium">
          Game paused by the host.
        </div>
      )}
      <HostActionsContext.Provider value={{ skip, pause }}>{screen}</HostActionsContext.Provider>
    </>
  );
}
