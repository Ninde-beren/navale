import clsx from 'clsx';
import type { GameView, PublicPlayer } from '@navale/protocol';
import { END_LABELS, VARIANT_LABELS } from '../../shared/labels.js';
import { playerLookup } from '../../shared/players.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { useCommittedShooters, useGame } from '../../shared/store.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { FeedbackButton } from '../../shared/ui/Feedback.js';
import { FlatButton } from '../../shared/ui/FlatButton.js';
import { SoundButton } from '../../shared/ui/SoundButton.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { timerSuffix, useCountdown } from '../../shared/useCountdown.js';
import { FxLayer } from './FxLayer.js';
import { PlayerZone } from './PlayerZone.js';
import { SalvoCollect, SalvoResolving } from './SalvoPanels.js';
import { ShotLog } from './ShotLog.js';
import { useShotSequence } from './useShotSequence.js';

/**
 * Écran central en partie : les grilles de chacun, au centre « Au tour de » ou la
 * collecte de la salve, l'annonce de chaque tir, le journal et les boutons de l'hôte.
 */
export function BoardPlaying({
  view,
  socket,
  layout,
  flat = false,
}: {
  view: GameView;
  socket: SocketRef;
  layout: 'p2' | 'p3' | '';
  /** Tablette à plat : chaque zone dans un cadre tourné vers son joueur, centre lisible dans les deux sens. */
  flat?: boolean;
}) {
  const { settings, players, round, code } = view;
  const { byId, nameOf } = playerLookup(players);
  const compact = layout === 'p2' || layout === 'p3' || flat;
  const isSalvo = settings.variant === 'simultaneous';
  const active = round?.activePlayerId ? byId.get(round.activePlayerId) : undefined;
  const committed = useCommittedShooters(round);
  const secondsLeft = useCountdown(round?.deadline ?? null);
  const { rootRef, reveals, fresh, callout, salvoStep } = useShotSequence({
    events: useGame((s) => s.events),
    players,
    revealDelayMs: settings.revealDelayMs,
    seq: view.seq,
  });

  const shooters = (round?.expectedShooters ?? [])
    .map((id) => byId.get(id))
    .filter((p) => p !== undefined);
  const resolving = isSalvo && salvoStep?.round === round?.index ? salvoStep : null;
  const isActive = (p: PublicPlayer) =>
    isSalvo
      ? round?.expectedShooters.includes(p.playerId) === true && !committed.includes(p.playerId)
      : active?.playerId === p.playerId;

  // À trois joueurs, la bande est basse : l'adresse remonte sous le code, loin du bord rogné des télés.
  const followUrl = (
    <span className="foot">
      Suivre la partie : {location.host}/board/{code}
    </span>
  );
  const resolvingPanel = resolving && (
    <SalvoResolving
      step={resolving}
      total={committed.length}
      shooterName={nameOf(resolving.shooterId)}
    />
  );

  const centreMain = isSalvo ? (
    <>
      {resolving && compact ? (
        resolvingPanel
      ) : (
        <SalvoCollect
          shooters={shooters}
          committed={committed}
          secondsLeft={secondsLeft}
          compact={compact}
        />
      )}
      {!compact && resolvingPanel}
    </>
  ) : (
    <ActiveTurn player={active} compact={compact} timer={timerSuffix(secondsLeft)} />
  );
  const calloutBox = (flip: boolean) => (
    <div
      className={clsx('callout big', flip && 'flip', callout?.cls, callout && 'show')}
      aria-hidden={flip || undefined}
    >
      <span className="word">{callout?.word ?? ''}</span>
      <span className="where">{callout?.where ?? ''}</span>
    </div>
  );

  return (
    <div className="board" ref={rootRef}>
      {players.map((p, seat) => {
        const zone = (
          <PlayerZone
            key={p.playerId}
            player={p}
            seat={seat}
            grid={settings.grid}
            active={isActive(p)}
            reveals={reveals[p.playerId] ?? []}
            fresh={fresh?.targetId === p.playerId ? fresh.coord : null}
          />
        );
        // À plat, chaque zone est dans un cadre tourné vers le côté de la table où son joueur est assis.
        return flat ? (
          <div key={p.playerId} className="seat" data-side={sideOf(players.length, seat)}>
            {zone}
          </div>
        ) : (
          zone
        );
      })}
      <aside className={`centre c-${active?.color ?? 'blue'}`}>
        <div className="top">
          <Wordmark />
          <span className="code">{code}</span>
          <span className="meta">
            <strong>Manche {(round?.index ?? 0) + 1}</strong> · {VARIANT_LABELS[settings.variant]} ·{' '}
            {END_LABELS[settings.endCondition]}
          </span>
          {layout === 'p3' && followUrl}
        </div>
        {flat ? (
          // Dos à dos au milieu : la copie à l'envers au-dessus, pour le joueur d'en face, le bloc à l'endroit au-dessous.
          <div className="duo">
            <div className="mirror" aria-hidden="true">
              {centreMain}
            </div>
            <div className="upright">{centreMain}</div>
          </div>
        ) : (
          centreMain
        )}
        {calloutBox(false)}
        {flat && calloutBox(true)}
        <ShotLog shots={view.lastShots} playerOf={(id) => byId.get(id)} />
        <div className="controls">
          {view.isHost && (
            <>
              <button
                className="btn ghost"
                onClick={() => void sendCommand(socket.current, { type: 'FORCE_ROUND' })}
              >
                {isSalvo ? 'Résoudre la salve' : 'Passer le tour'}
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm('Annuler la partie pour tout le monde ?'))
                    void sendCommand(socket.current, { type: 'CANCEL_GAME' });
                }}
              >
                Annuler
              </button>
            </>
          )}
          <span className="flex items-center gap-3">
            <SoundButton />
            <FlatButton />
            <FeedbackButton />
          </span>
          {layout !== 'p3' && followUrl}
        </div>
      </aside>
      <FxLayer />
    </div>
  );
}

/**
 * Côté de la table d'un siège, tablette à plat : à deux, les petits côtés ; à
 * trois, le bas puis la droite et la gauche ; à quatre, le tour complet.
 */
export function sideOf(players: number, seat: number): 'bottom' | 'right' | 'top' | 'left' {
  const sides =
    players <= 2
      ? (['left', 'right'] as const)
      : players === 3
        ? (['bottom', 'right', 'left'] as const)
        : (['bottom', 'right', 'top', 'left'] as const);
  return sides[seat % sides.length] ?? 'bottom';
}

/** Tour par tour : le joueur qui choisit sa cible. */
function ActiveTurn({
  player,
  compact,
  timer,
}: {
  player: PublicPlayer | undefined;
  compact: boolean;
  timer: string;
}) {
  if (!player) return <div className="turn dimmable" />;
  const avatar = <PlayerAvatar player={player} size="xl" />;
  const sub = <p className="sub">choisit sa cible{timer}</p>;
  return (
    <div className="turn dimmable">
      {compact ? (
        <>
          {avatar}
          <div className="txt">
            <span className="label">Au tour de</span>
            <h3>{player.name}</h3>
            {sub}
          </div>
        </>
      ) : (
        <>
          <span className="label">Au tour de</span>
          {avatar}
          <h3>{player.name}</h3>
          {sub}
        </>
      )}
    </div>
  );
}
