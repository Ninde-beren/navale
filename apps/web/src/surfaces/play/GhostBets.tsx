import clsx from 'clsx';
import { useState } from 'react';
import type { Bet, PlayerView, PublicPlayer } from '@navale/protocol';
import { BET_LABELS, betsLabel } from '../../shared/labels.js';
import { playerLookup } from '../../shared/players.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { useGame, useRoundResolving } from '../../shared/store.js';

const BETS: readonly Bet[] = ['HIT', 'MISS'];

/** Ce que la dernière manche réglée a donné à mon pronostic, d'après les événements reçus. */
function useLastSettlement(playerId: string): string | null {
  return useGame((s) => {
    for (let i = s.events.length - 1; i >= 0; i--) {
      const event = s.events[i]!.event;
      if (event.type !== 'BETS_SETTLED') continue;
      const mine = event.bets.find((b) => b.playerId === playerId);
      if (!mine) continue;
      if (event.outcome === null) return 'manche sans tir, pronostic annulé.';
      if (mine.bet === event.outcome) return 'vu juste !';
      return event.outcome === 'HIT' ? 'perdu, ça a touché.' : 'perdu, c’était dans l’eau.';
    }
    return null;
  });
}

/**
 * Le pronostic d'un fantôme sur la manche en cours : au moins un touché, ou aucun. Il se
 * change jusqu'au tir ; l'écran central dévoile ensuite qui a vu juste.
 */
export function GhostBets({
  view,
  me,
  socket,
}: {
  view: PlayerView;
  me: PublicPlayer;
  socket: SocketRef;
}) {
  const roundIndex = view.round?.index ?? -1;
  const resolving = useRoundResolving(roundIndex);
  const last = useLastSettlement(me.playerId);
  // Le pronostic envoyé, avant que l'instantané le confirme.
  const [sent, setSent] = useState<{ round: number; bet: Bet } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { nameOf } = playerLookup(view.players);
  if (!view.round) return null;

  const current = sent?.round === roundIndex ? sent.bet : view.me.bet;
  const open = view.me.canBet && !resolving;
  const active = view.round.activePlayerId;
  const question = resolving
    ? 'La manche se joue : regarde l’écran.'
    : view.settings.variant === 'simultaneous' || !active
      ? 'Au moins un touché dans cette salve ?'
      : `${nameOf(active)} tire : touché ou raté ?`;
  const others = view.players.filter((p) => p.playerId !== me.playerId && p.bets.total > 0);

  const place = async (bet: Bet) => {
    setSent({ round: roundIndex, bet });
    setError(null);
    const ack = await sendCommand(socket.current, { type: 'PLACE_BET', round: roundIndex, bet });
    if (!ack.ok) {
      setSent(null);
      setError(ack.error.message);
    }
  };

  return (
    <div className="panel ghost-bets flex flex-col gap-3">
      <span className="label">Ton pronostic · manche {roundIndex + 1}</span>
      <p className="ghost-question">{question}</p>
      <div className="ph-row">
        {BETS.map((bet) => (
          <button
            key={bet}
            type="button"
            className={clsx('btn', current === bet ? 'me' : 'ghost')}
            aria-pressed={current === bet}
            disabled={!open}
            onClick={() => void place(bet)}
          >
            {BET_LABELS[bet]}
          </button>
        ))}
      </div>
      {error && <p className="hint err">{error}</p>}
      <div className="kv">
        <span>Tes pronostics</span>
        <b>{me.bets.total > 0 ? betsLabel(me.bets) : 'aucun encore'}</b>
      </div>
      {others.map((p) => (
        <div key={p.playerId} className="kv">
          <span>{p.name}</span>
          <b>{betsLabel(p.bets)}</b>
        </div>
      ))}
      {last && <p className="muted">Dernière manche : {last}</p>}
    </div>
  );
}
