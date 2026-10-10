import { useNavigate } from 'react-router';
import clsx from 'clsx';
import type { PlayerView, PublicPlayer } from '@navale/protocol';
import { commanderOf } from '../../shared/labels.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { PhoneScreen } from '../../shared/ui/PhoneScreen.js';
import { ShareButton } from '../../shared/ui/ShareButton.js';
import { LeaveButton } from './LeaveButton.js';
import { MyFleetGrid } from './MyFleetGrid.js';

/** Au lobby, flotte validée : qui est prêt, et le lancement si ce téléphone est aussi l'hôte. */
export function Waiting({
  view,
  me,
  socket,
}: {
  view: PlayerView;
  me: PublicPlayer;
  socket: SocketRef;
}) {
  const navigate = useNavigate();
  const notReady = view.players.filter((p) => p.status !== 'READY');
  return (
    <PhoneScreen code={view.code} color={me.color} gap={16}>
      <div>
        <h1 className="h1">Tu es prêt</h1>
        <p className="muted">
          {view.startBlocker === null
            ? 'Tout le monde est prêt, l’hôte peut lancer.'
            : `En attente de ${notReady.map((p) => p.name).join(', ') || 'joueurs'}…`}
        </p>
      </div>
      <MyFleetGrid view={view} me={me} />
      <div className="panel flex flex-col gap-2">
        {view.players.map((p) => (
          <div key={p.playerId} className="kv">
            <span className="flex items-center gap-2">
              <PlayerAvatar player={p} size="sm" />
              {p.name}
              {p.playerId === me.playerId && <span className="faint">(toi)</span>}
              {commanderOf(view.settings, p.commanderId) && (
                <span className="faint">· {commanderOf(view.settings, p.commanderId)!.name}</span>
              )}
            </span>
            <span className={clsx('chip', p.status === 'READY' ? 'ready' : 'placing')}>
              {p.status === 'READY' ? 'Prêt' : 'Placement'}
            </span>
          </div>
        ))}
        <p className="hint">
          {view.players.length} / {view.settings.maxPlayers} joueurs
        </p>
      </div>
      {view.isHost && (
        <button
          className="btn xl me"
          type="button"
          disabled={view.startBlocker !== null}
          onClick={() => void sendCommand(socket.current, { type: 'START_GAME' })}
        >
          Lancer la partie
        </button>
      )}
      <button
        className="btn ghost"
        type="button"
        onClick={() => void sendCommand(socket.current, { type: 'SET_READY', ready: false })}
      >
        Modifier ma flotte
      </button>
      <ShareButton code={view.code} from="phone" label="Inviter des amis à distance" />
      <LeaveButton code={view.code} socket={socket} onLeft={() => void navigate('/')} />
    </PhoneScreen>
  );
}
