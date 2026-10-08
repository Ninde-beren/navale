import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PRESETS, defaultPresetFor } from '@navale/engine';
import {
  SHIP_LABELS_FR,
  type EndCondition,
  type PresetId,
  type SalvoOrder,
  type SunkReveal,
  type Variant,
} from '@navale/protocol';
import { api, ApiError } from '../../shared/api.js';
import { saveSession } from '../../shared/session.js';
import { Notice } from '../../shared/ui/Notice.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { PHONE_QUERY, useMedia } from '../../shared/useMedia.js';

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
  const phone = useMedia(PHONE_QUERY);
  const [variant, setVariant] = useState<Variant>('sequential');
  const [endCondition, setEndCondition] = useState<EndCondition>('last_standing');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [sunkReveal, setSunkReveal] = useState<SunkReveal>('classic');
  const [timer, setTimer] = useState<'none' | '45' | '90'>('none');
  const [salvoOrder, setSalvoOrder] = useState<SalvoOrder>('commit');
  const [timerTouched, setTimerTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectivePreset = preset ?? defaultPresetFor(maxPlayers);
  const fleet = PRESETS[effectivePreset];

  if (phone)
    return (
      <Notice
        title="La partie se crée sur l’écran central"
        text="Ouvre Navale sur un ordinateur ou une tablette, celui qui servira d’écran central. Ton téléphone sert à rejoindre."
        action={{ to: '/', label: 'Retour à l’accueil' }}
      />
    );

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
          salvoOrder,
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
          onChange={(v) => {
            setVariant(v);
            // Proposé par défaut : 45 s en salve, aucun chrono en tour par tour.
            if (!timerTouched) setTimer(v === 'simultaneous' ? '45' : 'none');
          }}
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
      {variant === 'simultaneous' && (
        <div className="field">
          <span className="label">Résolution de la salve</span>
          <Seg
            value={salvoOrder}
            options={[
              ['commit', 'Le plus rapide d’abord'],
              ['seats', 'Ordre des sièges'],
            ]}
            onChange={setSalvoOrder}
          />
          <p className="hint">
            {salvoOrder === 'commit'
              ? 'Les tirs se résolvent dans l’ordre où ils ont été engagés ; un bateau achevé par deux tirs est crédité au plus rapide.'
              : 'Les tirs se résolvent siège par siège, en tournant à chaque manche.'}
          </p>
        </div>
      )}
      <div className="field">
        <span className="label">Chrono par manche</span>
        <Seg
          value={timer}
          options={[
            ['none', 'Aucun'],
            ['45', '45 s'],
            ['90', '90 s'],
          ]}
          onChange={(v) => {
            setTimer(v);
            setTimerTouched(true);
          }}
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
