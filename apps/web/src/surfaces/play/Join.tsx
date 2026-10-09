import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import {
  COLOR_IDS,
  JoinedSchema,
  PLAYER_NAME_LENGTH,
  type ColorId,
  type GameView,
} from '@navale/protocol';
import { rememberName, useProfile, useRecord } from '../../shared/profile.js';
import { recordLabel } from '../../shared/record.js';
import { sendCommand, type SocketRef } from '../../shared/socket.js';
import { initialOf } from '../../shared/ui/Avatar.js';
import { PhoneHeader } from '../../shared/ui/PhoneScreen.js';

export function Join({
  view,
  socket,
  onJoined,
}: {
  view: GameView;
  socket: SocketRef;
  onJoined: (playerId: string, token: string) => void;
}) {
  const taken = new Map(view.players.map((p) => [p.color, p.name]));
  // Le pseudo de la dernière fois est proposé d'office.
  const [name, setName] = useState(() => useProfile.getState().name);
  const [color, setColor] = useState<ColorId | null>(COLOR_IDS.find((c) => !taken.has(c)) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const record = recordLabel(useRecord());
  const full = view.players.length >= view.settings.maxPlayers;
  const valid = name.trim().length >= PLAYER_NAME_LENGTH.min && color !== null && !taken.has(color);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !color) return;
    setBusy(true);
    setError(null);
    const ack = await sendCommand(socket.current, { type: 'JOIN_GAME', name: name.trim(), color });
    if (!ack.ok) {
      setError(ack.error.message);
      setBusy(false);
      return;
    }
    const { playerId, playerToken } = JoinedSchema.parse(ack.data);
    rememberName(name.trim());
    onJoined(playerId, playerToken);
  };

  return (
    <form className="app-phone" style={{ padding: 24, gap: 24 }} onSubmit={(e) => void submit(e)}>
      <PhoneHeader code={view.code} />
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
          maxLength={PLAYER_NAME_LENGTH.max}
          autoComplete="nickname"
          placeholder={`${PLAYER_NAME_LENGTH.min} à ${PLAYER_NAME_LENGTH.max} caractères`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {record && <p className="hint">Ton bilan sur ce téléphone : {record}.</p>}
      <div className="field">
        <span className="label">Ta couleur</span>
        <div className="swatches">
          {COLOR_IDS.map((c) => {
            const owner = taken.get(c);
            return (
              <button
                key={c}
                type="button"
                className={clsx('swatch', `c-${c}`, color === c && 'on', owner && 'taken')}
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
