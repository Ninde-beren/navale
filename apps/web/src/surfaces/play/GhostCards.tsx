import clsx from 'clsx';
import { coordKey } from '@navale/engine';
import { useState } from 'react';
import { coordLabel, type Coord, type GhostCard, type PlayerView } from '@navale/protocol';
import { GHOST_CARD_HINTS, GHOST_CARD_LABELS, count } from '../../shared/labels.js';
import { playerLookup } from '../../shared/players.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { useRoundResolving } from '../../shared/store.js';
import { TargetGrid } from './TargetGrid.js';

/** Le bouton qui joue une carte sans cible. */
const PLAY_LABELS: Record<Exclude<GhostCard, 'wisp'>, string> = {
  barrage: 'Lancer le barrage',
  low_tide: 'Déclencher la marée basse',
};

/**
 * La carte d'un fantôme : celle de son commandant, ou celle de son choix, dès qu'elle est
 * prête. Elle part à la fin de la manche, après les tirs ; le feu follet vise une case
 * encore cachée chez un survivant.
 */
export function GhostCards({ view, socket }: { view: PlayerView; socket: SocketRef }) {
  const roundIndex = view.round?.index ?? -1;
  const resolving = useRoundResolving(roundIndex);
  const cards = view.me.ghostCards;
  const [chosen, setChosen] = useState<GhostCard | null>(null);
  const card = chosen && cards.includes(chosen) ? chosen : (cards[0] ?? null);
  const survivors = view.players.filter((p) => p.status === 'ALIVE');
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = survivors.find((p) => p.playerId === targetId) ?? survivors[0];
  const [cell, setCell] = useState<Coord | null>(null);
  // La carte envoyée, avant que l'instantané la confirme.
  const [sentIn, setSentIn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { nameOf } = playerLookup(view.players);
  const me = view.players.find((p) => p.playerId === view.me.playerId);
  if (!view.round || !me) return null;

  const play = view.me.ghostPlay;
  if (play || sentIn === roundIndex) {
    const what = play ? GHOST_CARD_LABELS[play.card] : 'Ta carte';
    const where =
      play?.card === 'wisp' && play.targetId && play.coord
        ? ` sur ${nameOf(play.targetId)}, en ${coordLabel(play.coord)}`
        : '';
    return (
      <div className="panel ghost-card flex flex-col gap-2">
        <span className="label">Ta carte</span>
        <p>
          {what}
          {where} : elle part à la fin de la manche.
        </p>
      </div>
    );
  }
  if (!card) {
    const left = me.ghostReadyAt === null ? null : me.ghostReadyAt - roundIndex;
    if (left === null || left <= 0) return null;
    return (
      <div className="panel ghost-card flex flex-col gap-2">
        <span className="label">Ta carte</span>
        <p className="muted">Prochaine carte dans {count(left, 'manche')}.</p>
      </div>
    );
  }

  const lit = new Set((target?.lit ?? []).map((l) => coordKey(l.coord)));
  const aimed = card === 'wisp' ? cell : null;
  const ready = !resolving && (card !== 'wisp' || (target !== undefined && aimed !== null));
  const send = async () => {
    setError(null);
    const ack = await sendCommand(socket.current, {
      type: 'PLAY_GHOST_CARD',
      round: roundIndex,
      card,
      ...(card === 'wisp' && target && aimed ? { targetId: target.playerId, coord: aimed } : {}),
    });
    if (ack.ok) setSentIn(roundIndex);
    else setError(ack.error.message);
  };

  return (
    <div className="panel ghost-card flex flex-col gap-3">
      <span className="label">Ta carte est prête</span>
      {cards.length > 1 ? (
        <div className="seg">
          {cards.map((c) => (
            <button
              key={c}
              type="button"
              className={c === card ? 'on' : ''}
              onClick={() => setChosen(c)}
            >
              {GHOST_CARD_LABELS[c]}
            </button>
          ))}
        </div>
      ) : (
        <p className="ghost-question">{GHOST_CARD_LABELS[card]}</p>
      )}
      <p className="muted">{GHOST_CARD_HINTS[card]}</p>
      {card === 'wisp' && target && (
        <>
          {survivors.length > 1 && (
            <div className="ph-row">
              {survivors.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  className={clsx('btn sm', p.playerId === target.playerId ? 'me' : 'ghost')}
                  onClick={() => {
                    setTargetId(p.playerId);
                    setCell(null);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <TargetGrid
            view={view}
            target={target}
            radars={view.me.radarResults.filter((r) => r.targetId === target.playerId)}
            cell={aimed}
            onCell={(c) => {
              if (!lit.has(coordKey(c))) setCell(c);
            }}
          />
        </>
      )}
      <button className="btn me" type="button" disabled={!ready} onClick={() => void send()}>
        {card === 'wisp'
          ? aimed && target
            ? `Éclairer ${coordLabel(aimed)} chez ${target.name}`
            : 'Choisis une case cachée'
          : PLAY_LABELS[card]}
      </button>
      {resolving && <p className="muted">La manche se joue : ta carte attendra la suivante.</p>}
      {error && <p className="hint err">{error}</p>}
    </div>
  );
}
