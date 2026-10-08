import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { SHIP_LABELS_FR } from '@navale/protocol';
import { sendCommand } from '../../shared/socket.js';
import { useFitText } from '../../shared/useFitText.js';
import type { View } from '../../shared/store.js';
import { Avatar, initialOf } from '../../shared/ui/Avatar.js';
import { FeedbackButton } from '../../shared/ui/Feedback.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';

const VARIANT = { sequential: 'Tour par tour', simultaneous: 'Salve' } as const;
const END = {
  last_standing: 'Dernier survivant',
  first_fleet_sunk: 'Première flotte coulée',
} as const;

export function BoardLobby({ view, socket }: { view: View; socket: RefObject<Socket | null> }) {
  const { settings, players, code } = view;
  const free = settings.maxPlayers - players.length;
  const notReady = players.filter((p) => p.status !== 'READY');
  const canStart = players.length >= 2 && notReady.length === 0;
  const why =
    players.length < 2
      ? 'Il faut au moins deux joueurs.'
      : notReady.length > 0
        ? `En attente de ${notReady.map((p) => p.name).join(' et ')} · ${notReady.length} joueur${notReady.length > 1 ? 's placent' : ' place'} encore sa flotte`
        : 'Tout le monde est prêt.';
  const cells = settings.fleet.reduce((n, s) => n + s.size, 0);
  const joinUrl = `${location.origin}/play/${code}`;
  const codeRef = useFitText<HTMLDivElement>(code, 320);

  return (
    <>
      <header className="tv-bar">
        <Wordmark />
        <span className="code">{code}</span>
        <div className="center">
          <strong>Partie en attente</strong> · {VARIANT[settings.variant]} ·{' '}
          {END[settings.endCondition]}
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
              <span className="url">{joinUrl.replace(/^https?:\/\//, '')}</span>
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
                <Avatar color={p.color} initial={initialOf(p.name)} bot={p.kind === 'bot'} />
                <div className="nm">
                  {p.name}
                  {p.kind === 'bot' && <span className="chip plain">Bot</span>}
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
                <button
                  className="btn ghost"
                  onClick={() => void sendCommand(socket.current, { type: 'ADD_BOT' })}
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
            <span className="chip plain">{VARIANT[settings.variant]}</span>
            <span className="chip plain">{END[settings.endCondition]}</span>
            <span className="chip plain">
              {settings.grid.width} × {settings.grid.height}
            </span>
            <span
              className="chip plain"
              title={settings.fleet
                .map((s) => `${SHIP_LABELS_FR[s.type] ?? s.type} ${s.size}`)
                .join(', ')}
            >
              {settings.fleet.length} bateaux · {cells} cases
            </span>
            <span className="chip plain">
              {settings.roundTimerSeconds
                ? `Chrono ${settings.roundTimerSeconds} s`
                : 'Sans chrono'}
            </span>
            {settings.variant === 'simultaneous' && (
              <span className="chip plain">
                {settings.salvoOrder === 'seats' ? 'Ordre des sièges' : 'Le plus rapide d’abord'}
              </span>
            )}
          </div>
          <div className="launch">
            {view.isHost ? (
              <button
                className="btn primary xl"
                disabled={!canStart}
                onClick={() => void sendCommand(socket.current, { type: 'START_GAME' })}
              >
                Lancer la partie
              </button>
            ) : (
              <p className="why">L'hôte lance la partie quand tout le monde est prêt.</p>
            )}
            <p className="why">{why}</p>
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
