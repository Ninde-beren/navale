import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PRESETS, defaultPresetFor } from '@navale/engine';
import {
  SHIP_LABELS_FR,
  type EndCondition,
  type PresetId,
  type SunkReveal,
  type Variant,
} from '@navale/protocol';
import { api, ApiError } from '../../shared/api.js';
import { saveSession } from '../../shared/session.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={v === value ? 'on' : ''}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function CreateGame() {
  const navigate = useNavigate();
  const [variant, setVariant] = useState<Variant>('sequential');
  const [endCondition, setEndCondition] = useState<EndCondition>('last_standing');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [sunkReveal, setSunkReveal] = useState<SunkReveal>('classic');
  const [timer, setTimer] = useState<'none' | '45' | '90'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectivePreset = preset ?? defaultPresetFor(maxPlayers);
  const fleet = PRESETS[effectivePreset];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createGame({
        settings: {
          variant,
          maxPlayers,
          endCondition,
          sunkReveal,
          roundTimerSeconds: timer === 'none' ? null : Number(timer),
        },
        preset: effectivePreset,
      });
      saveSession(res.code, { gameId: res.gameId, hostToken: res.hostToken });
      void navigate(`/board/${res.code}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Le serveur ne répond pas.');
      setBusy(false);
    }
  };

  return (
    <div className="app-phone" style={{ padding: 24, gap: 20 }}>
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link className="btn sm ghost" to="/" style={{ width: 'auto' }}>
          Retour
        </Link>
      </div>
      <h1 className="h1">Nouvelle partie</h1>
      <div className="field">
        <span className="label">Variante</span>
        <Seg
          value={variant}
          options={[
            ['sequential', 'Tour par tour'],
            ['simultaneous', 'Salve'],
          ]}
          onChange={setVariant}
        />
        <p className="hint">
          {variant === 'sequential'
            ? 'Un joueur tire à la fois, dans l’ordre des sièges.'
            : 'Tout le monde tire en secret, l’écran central résout les tirs un par un.'}
        </p>
      </div>
      <div className="field">
        <span className="label">Fin de partie</span>
        <Seg
          value={endCondition}
          options={[
            ['last_standing', 'Dernier survivant'],
            ['first_fleet_sunk', 'Première flotte coulée'],
          ]}
          onChange={setEndCondition}
        />
      </div>
      <div className="field">
        <span className="label">Joueurs au maximum</span>
        <Seg
          value={String(maxPlayers)}
          options={[
            ['2', '2'],
            ['3', '3'],
            ['4', '4'],
          ]}
          onChange={(v) => setMaxPlayers(Number(v))}
        />
      </div>
      <div className="field">
        <span className="label">Grille et flotte</span>
        <Seg
          value={effectivePreset}
          options={[
            ['classic', 'Classique 10×10'],
            ['quick', 'Rapide 8×8'],
          ]}
          onChange={setPreset}
        />
        <p className="hint">
          {fleet.fleet.map((s) => `${SHIP_LABELS_FR[s.type] ?? s.type} (${s.size})`).join(' · ')}
        </p>
      </div>
      <div className="field">
        <span className="label">Bateau coulé</span>
        <Seg
          value={sunkReveal}
          options={[
            ['classic', 'Cases révélées'],
            ['secret', 'Seulement « coulé »'],
          ]}
          onChange={setSunkReveal}
        />
      </div>
      <div className="field">
        <span className="label">Chrono par manche</span>
        <Seg
          value={timer}
          options={[
            ['none', 'Aucun'],
            ['45', '45 s'],
            ['90', '90 s'],
          ]}
          onChange={setTimer}
        />
      </div>
      {error && <p className="hint err">{error}</p>}
      <button
        className="btn primary xl"
        type="button"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? 'Création…' : 'Créer et afficher l’écran central'}
      </button>
    </div>
  );
}
