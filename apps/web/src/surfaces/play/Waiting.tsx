import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import type { PlayerView } from '@navale/protocol';
import { ownGridClasses } from '../../shared/cells.js';
import { sendCommand } from '../../shared/socket.js';
import { Avatar, initialOf } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';

export function Waiting({ view, socket }: { view: PlayerView; socket: RefObject<Socket | null> }) {
  const me = view.players.find((p) => p.playerId === view.me.playerId)!;
  const notReady = view.players.filter((p) => p.status !== 'READY');
  const canStart = view.players.length >= 2 && notReady.length === 0;
  return (
    <div className={`app-phone me-${me.color}`} style={{ padding: '16px 16px 24px', gap: 16 }}>
      <div className="flex items-center justify-between">
        <Wordmark />
        <span className="chip plain">{view.code}</span>
      </div>
      <div>
        <h1 className="h1">Tu es prêt</h1>
        <p className="muted">
          {canStart
            ? 'Tout le monde est prêt, l’hôte peut lancer.'
            : `En attente de ${notReady.map((p) => p.name).join(', ') || 'joueurs'}…`}
        </p>
      </div>
      <div className="flex justify-center">
        <Grid
          width={view.settings.grid.width}
          height={view.settings.grid.height}
          cellClass={ownGridClasses(view.me.fleet, [])}
          label="Ma flotte"
        />
      </div>
      <div className="panel flex flex-col gap-2">
        {view.players.map((p) => (
          <div key={p.playerId} className="kv">
            <span className="flex items-center gap-2">
              <Avatar
                color={p.color}
                initial={initialOf(p.name)}
                size="sm"
                bot={p.kind === 'bot'}
              />
              {p.name}
              {p.playerId === me.playerId && <span className="faint">(toi)</span>}
            </span>
            <span className={`chip ${p.status === 'READY' ? 'ready' : 'placing'}`}>
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
          disabled={!canStart}
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
    </div>
  );
}
