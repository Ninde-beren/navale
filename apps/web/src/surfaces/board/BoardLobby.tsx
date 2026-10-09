import { useState } from 'react';
import type { BotLevel, GameView } from '@navale/protocol';
import {
  BOT_LEVEL_LABELS,
  END_LABELS,
  SALVO_ORDER_LABELS,
  VARIANT_LABELS,
  afkBotLabel,
  antiFocusLabel,
  count,
  fleetSummary,
} from '../../shared/labels.js';
import { boardUrl, shortUrl } from '../../shared/share.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { useFitText } from '../../shared/useFitText.js';
import { PlayerAvatar } from '../../shared/ui/Avatar.js';
import { FeedbackButton } from '../../shared/ui/Feedback.js';
import { FlatButton } from '../../shared/ui/FlatButton.js';
import { ShareButton } from '../../shared/ui/ShareButton.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';

/** Ce qui manque encore pour lancer, dit à la table. */
function startHint(view: GameView): string {
  switch (view.startBlocker) {
    case null:
      return 'Tout le monde est prêt.';
    case 'NOT_ENOUGH_PLAYERS':
      return 'Il faut au moins deux joueurs.';
    case 'NO_HUMAN':
      return 'Il faut au moins un joueur humain.';
    case 'PLAYERS_NOT_READY': {
      const placing = view.players.filter((p) => p.status !== 'READY');
      const names = placing.map((p) => p.name).join(' et ');
      return `En attente de ${names} · ${placing.length > 1 ? `${placing.length} joueurs placent` : '1 joueur place'} encore sa flotte`;
    }
  }
}

/** Écran central avant le lancement : le code et le QR, les joueurs, les réglages, le lancement. */
export function BoardLobby({ view, socket }: { view: GameView; socket: SocketRef }) {
  const { settings, players, code } = view;
  // Niveau du prochain bot ajouté ; chaque bot garde le sien.
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const free = settings.maxPlayers - players.length;
  const cells = settings.fleet.reduce((n, s) => n + s.size, 0);
  const joinUrl = `${location.origin}/play/${code}`;
  const codeRef = useFitText<HTMLDivElement>(code, 320);

  return (
    <>
      <header className="tv-bar">
        <Wordmark />
        <span className="code">{code}</span>
        <div className="center">
          <strong>Partie en attente</strong> · {VARIANT_LABELS[settings.variant]} ·{' '}
          {END_LABELS[settings.endCondition]}
        </div>
        <div className="right">
          <FeedbackButton />
        </div>
      </header>
      <div className="lobby">
        <section className="join">
          <span className="label">Code de la partie</span>
          <div className="bigcode" ref={codeRef}>
            {code}
          </div>
          <div className="scan">
            <div className="qrcard">
              <img
                src={`/api/games/${code}/qr.svg`}
                alt={`QR code pour rejoindre la partie ${code}`}
              />
            </div>
            <div className="txt">
              <h2>Scanne pour rejoindre</h2>
              <p>
                Avec l'appareil photo du téléphone. Ou ouvre le site et saisis le code{' '}
                <b style={{ color: 'var(--text)' }}>{code}</b>.
              </p>
              <span className="url">{shortUrl(joinUrl)}</span>
              <div className="remote">
                <span className="lbl">À distance ? Partage l'écran central</span>
                <span className="url">{shortUrl(boardUrl(code))}</span>
                <ShareButton code={code} variant="icon" />
              </div>
            </div>
          </div>
        </section>
        <aside className="players">
          <div className="head">
            <h2>Joueurs</h2>
            <span className="n">
              {players.length} / {settings.maxPlayers} places
            </span>
          </div>
          <div className="plist">
            {players.map((p) => (
              <div key={p.playerId} className="prow">
                <PlayerAvatar player={p} />
                <div className="nm">
                  {p.name}
                  {p.kind === 'bot' && (
                    <span className="chip plain">
                      Bot
                      {p.level && p.level !== 'normal'
                        ? ` · ${BOT_LEVEL_LABELS[p.level].toLowerCase()}`
                        : ''}
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-3">
                  {p.status === 'READY' ? (
                    <span className="chip ready">Prêt</span>
                  ) : (
                    <span className="chip placing">Placement en cours</span>
                  )}
                  {view.isHost && p.kind === 'human' && (
                    <button
                      className="icon-btn"
                      aria-label={`Exclure ${p.name}`}
                      title={`Exclure ${p.name}`}
                      onClick={() => {
                        if (confirm(`Exclure ${p.name} de la partie ?`))
                          void sendCommand(socket.current, {
                            type: 'KICK_PLAYER',
                            playerId: p.playerId,
                          });
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  )}
                </span>
              </div>
            ))}
            {view.isHost && free > 0 && (
              <div className="prow add">
                <div
                  className="seg bot-level"
                  role="radiogroup"
                  aria-label="Niveau du prochain bot"
                >
                  {(Object.keys(BOT_LEVEL_LABELS) as BotLevel[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={botLevel === level}
                      className={botLevel === level ? 'on' : ''}
                      onClick={() => setBotLevel(level)}
                    >
                      {BOT_LEVEL_LABELS[level]}
                    </button>
                  ))}
                </div>
                <button
                  className="btn ghost"
                  onClick={() =>
                    void sendCommand(socket.current, { type: 'ADD_BOT', level: botLevel })
                  }
                >
                  + Ajouter un bot
                </button>
              </div>
            )}
            {Array.from({ length: Math.max(0, free - (view.isHost ? 1 : 0)) }, (_, i) => (
              <div key={i} className="prow empty">
                Place libre · scanne le QR pour rejoindre
              </div>
            ))}
          </div>
          <div className="settings">
            <span className="chip plain">{VARIANT_LABELS[settings.variant]}</span>
            <span className="chip plain">{END_LABELS[settings.endCondition]}</span>
            <span className="chip plain">
              {settings.grid.width} × {settings.grid.height}
            </span>
            <span className="chip plain" title={fleetSummary(settings.fleet)}>
              {count(settings.fleet.length, 'bateau', 'bateaux')} · {count(cells, 'case')}
            </span>
            <span className="chip plain">
              {settings.roundTimerSeconds
                ? `Chrono ${settings.roundTimerSeconds} s`
                : 'Sans chrono'}
            </span>
            {settings.variant === 'simultaneous' && (
              <span className="chip plain">{SALVO_ORDER_LABELS[settings.salvoOrder]}</span>
            )}
            {settings.antiFocusMaxStreak !== null && (
              <span className="chip plain">{antiFocusLabel(settings.antiFocusMaxStreak)}</span>
            )}
            {/* `typeof` : les parties journalisées avant ce réglage ne l'ont pas. */}
            {typeof settings.afkBotSeconds === 'number' && (
              <span className="chip plain">{afkBotLabel(settings.afkBotSeconds)}</span>
            )}
            <FlatButton variant="chip" />
          </div>
          <div className="launch">
            {view.isHost ? (
              <button
                className="btn primary xl"
                disabled={view.startBlocker !== null}
                onClick={() => void sendCommand(socket.current, { type: 'START_GAME' })}
              >
                Lancer la partie
              </button>
            ) : (
              <p className="why">L'hôte lance la partie quand tout le monde est prêt.</p>
            )}
            <p className="why">{startHint(view)}</p>
            {view.isHost && (
              <div className="hostrow">
                {players.some((p) => p.kind === 'bot') && (
                  <button
                    className="btn ghost"
                    onClick={() => {
                      const bot = [...players].reverse().find((p) => p.kind === 'bot');
                      if (bot)
                        void sendCommand(socket.current, {
                          type: 'REMOVE_BOT',
                          playerId: bot.playerId,
                        });
                    }}
                  >
                    Retirer le bot
                  </button>
                )}
                <button
                  className="btn danger"
                  onClick={() => {
                    if (confirm('Annuler la partie ?'))
                      void sendCommand(socket.current, { type: 'CANCEL_GAME' });
                  }}
                >
                  Annuler la partie
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
