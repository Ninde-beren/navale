import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { coordLabel, type PublicPlayer } from '@navale/protocol';
import { publicGridClasses } from '../../shared/cells.js';
import { sendCommand } from '../../shared/socket.js';
import type { View } from '../../shared/store.js';
import { Avatar, initialOf } from '../../shared/ui/Avatar.js';
import { Grid } from '../../shared/ui/Grid.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';

const VARIANT = { sequential: 'Tour par tour', simultaneous: 'Salve' } as const;
const END = {
  last_standing: 'Dernier survivant',
  first_fleet_sunk: 'Première flotte coulée',
} as const;
const RESULT = { MISS: 'RATÉ', HIT: 'TOUCHÉ', SUNK: 'COULÉ' } as const;

function Zone({
  p,
  active,
  impact,
  seat,
}: {
  p: PublicPlayer;
  active: boolean;
  impact: boolean;
  seat: number;
}) {
  return (
    <section
      className={`zone c-${p.color} ${active ? 'active' : ''} ${impact ? 'impact' : ''} ${p.status === 'ELIMINATED' ? 'out' : ''}`}
      data-seat={seat}
      data-player={p.playerId}
    >
      <div className="nameplate">
        <Avatar color={p.color} initial={initialOf(p.name)} bot={p.kind === 'bot'} />
        <h2>{p.name}</h2>
        {!p.connected && p.kind === 'human' && <span className="role">hors ligne</span>}
      </div>
      <Grid
        width={8}
        height={8}
        cellClass={publicGridClasses(p.revealed, p.sunkShips)}
        className={p.status === 'ELIMINATED' ? 'dim' : ''}
        label={`Grille de ${p.name}`}
      />
      {p.status === 'ELIMINATED' && (
        <div className="stamp">{p.rank ? `${p.rank}e` : 'Éliminé'}</div>
      )}
    </section>
  );
}

/**
 * Plateau en partie. Jalon M2 : état public et « Au tour de » ; la séquence
 * animée du tir (missile, impact, callout) arrive au jalon M3.
 */
export function BoardPlaying({ view, socket }: { view: View; socket: RefObject<Socket | null> }) {
  const { settings, players, round, code } = view;
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const active = round?.activePlayerId ? byId.get(round.activePlayerId) : undefined;
  const lastTarget = view.lastShots.at(-1)?.targetId;
  const name = (id: string) => byId.get(id)?.name ?? '?';

  return (
    <div className="board">
      {players.map((p, i) => (
        <Zone
          key={p.playerId}
          p={p}
          seat={i}
          active={!!active && active.playerId === p.playerId}
          impact={lastTarget === p.playerId}
        />
      ))}
      <aside className={`centre c-${active?.color ?? 'blue'}`}>
        <div className="top">
          <Wordmark />
          <span className="code">{code}</span>
          <span className="meta">
            <strong>Manche {(round?.index ?? 0) + 1}</strong> · {VARIANT[settings.variant]} ·{' '}
            {END[settings.endCondition]}
          </span>
        </div>
        <div className="turn">
          {settings.variant === 'sequential' && active ? (
            <>
              <span className="label">Au tour de</span>
              <Avatar color={active.color} initial={initialOf(active.name)} size="xl" />
              <h3>{active.name}</h3>
              <p className="sub">choisit sa cible</p>
            </>
          ) : (
            <>
              <span className="label">Ont tiré</span>
              <h3>
                {round?.committed.length ?? 0}/{round?.expectedShooters.length ?? 0}
              </h3>
            </>
          )}
        </div>
        <div className="log">
          <span className="label">Derniers tirs</span>
          {[...view.lastShots].reverse().map((s, i) => (
            <div key={i} className="row">
              <Avatar
                color={byId.get(s.shooterId)?.color ?? 'red'}
                initial={initialOf(name(s.shooterId))}
                size="sm"
              />
              <span className="who">{name(s.shooterId)}</span>
              <span className="arrow">→</span>
              <Avatar
                color={byId.get(s.targetId)?.color ?? 'red'}
                initial={initialOf(name(s.targetId))}
                size="sm"
              />
              <span className="who">{name(s.targetId)}</span>
              <span className="coord">{coordLabel(s.coord)}</span>
              <span className={`res ${s.result.toLowerCase()}`}>{RESULT[s.result]}</span>
            </div>
          ))}
        </div>
        <div className="controls">
          {view.isHost && (
            <button
              className="btn ghost"
              onClick={() => void sendCommand(socket.current, { type: 'FORCE_ROUND' })}
            >
              {settings.variant === 'sequential' ? 'Passer le tour' : 'Résoudre la salve'}
            </button>
          )}
          <span className="foot">
            Suivre la partie : {location.host}/board/{code}
          </span>
        </div>
      </aside>
    </div>
  );
}
