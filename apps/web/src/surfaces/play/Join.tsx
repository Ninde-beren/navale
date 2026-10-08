import { useState, type FormEvent, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { COLOR_IDS, type ColorId } from '@navale/protocol';
import { sendCommand } from '../../shared/socket.js';
import type { View } from '../../shared/store.js';
import { FeedbackButton } from '../../shared/ui/Feedback.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { initialOf } from '../../shared/ui/Avatar.js';

export function Join({
  view,
  socket,
  onJoined,
}: {
  view: View;
  socket: RefObject<Socket | null>;
  onJoined: (playerId: string, token: string) => void;
}) {
  const taken = new Map(view.players.map((p) => [p.color, p.name]));
  const [name, setName] = useState('');
  const [color, setColor] = useState<ColorId | null>(COLOR_IDS.find((c) => !taken.has(c)) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = view.players.length >= view.settings.maxPlayers;
  const valid = name.trim().length >= 2 && color !== null && !taken.has(color);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !color) return;
    setBusy(true);
    setError(null);
    const ack = await sendCommand(socket.current, { type: 'JOIN_GAME', name: name.trim(), color });
    if (ack.ok) {
      const data = ack.data as { playerId: string; playerToken: string };
      onJoined(data.playerId, data.playerToken);
    } else {
      setError(ack.error.message);
      setBusy(false);
    }
  };

  return (
    <form className="app-phone" style={{ padding: 24, gap: 24 }} onSubmit={(e) => void submit(e)}>
      <div className="flex items-center justify-between">
        <Wordmark />
        <span className="flex items-center gap-2">
          <FeedbackButton />
          <span className="chip plain">{view.code}</span>
        </span>
      </div>
      <h1 className="h1">Rejoindre la partie</h1>
      {full ? (
        <p className="hint err">La partie est pleine ({view.settings.maxPlayers} joueurs).</p>
      ) : (
        <p className="muted">
          {view.players.length} joueur{view.players.length > 1 ? 's' : ''} déjà là
          {view.players.length > 0 ? ` : ${view.players.map((p) => p.name).join(', ')}` : ''}.
        </p>
      )}
      <label className="field">
        <span className="label">Ton pseudo</span>
        <input
          className="input"
          maxLength={16}
          autoComplete="nickname"
          placeholder="2 à 16 caractères"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="field">
        <span className="label">Ta couleur</span>
        <div className="swatches">
          {COLOR_IDS.map((c) => {
            const owner = taken.get(c);
            return (
              <button
                key={c}
                type="button"
                className={`swatch c-${c} ${color === c ? 'on' : ''} ${owner ? 'taken' : ''}`}
                data-ini={owner ? initialOf(owner) : ''}
                disabled={!!owner}
                aria-label={c}
                onClick={() => setColor(c)}
              />
            );
          })}
        </div>
      </div>
      {error && <p className="hint err">{error}</p>}
      <button
        className={`btn xl ${color ? `me-${color} me` : 'primary'}`}
        type="submit"
        disabled={!valid || busy || full}
      >
        {busy ? 'Connexion…' : 'Rejoindre'}
      </button>
    </form>
  );
}
