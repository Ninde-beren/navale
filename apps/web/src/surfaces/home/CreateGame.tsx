import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { COMMANDERS, PRESETS, defaultPresetFor } from '@navale/engine';
import type {
  EliminatedRole,
  EndCondition,
  PresetId,
  SalvoOrder,
  SunkReveal,
  Variant,
} from '@navale/protocol';
import { api, ApiError } from '../../shared/api.js';
import { publicGridClasses } from '../../shared/cells.js';
import {
  END_LABELS,
  SALVO_ORDER_LABELS,
  SUNK_REVEAL_LABELS,
  VARIANT_LABELS,
  choices,
  count,
  fleetSummary,
  afkBotLabel,
  antiFocusLabel,
} from '../../shared/labels.js';
import { saveSession } from '../../shared/session.js';
import { Grid } from '../../shared/ui/Grid.js';
import { Notice } from '../../shared/ui/Notice.js';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { PHONE_QUERY, useMedia } from '../../shared/useMedia.js';

const PRESET_LABELS: Record<PresetId, string> = {
  classic: 'Classique 10×10',
  quick: 'Rapide 8×8',
};
/** En liste, pas en objet : les clés numériques passeraient avant « Aucun ». */
type AntiFocusChoice = 'none' | '2' | '1';
const ANTI_FOCUS_CHOICES: Array<[AntiFocusChoice, string]> = [
  ['none', 'Libre'],
  ['2', '2 de suite'],
  ['1', 'Alterner'],
];
const TIMER_CHOICES = [
  ['none', 'Aucun'],
  ['45', '45 s'],
  ['90', '90 s'],
] as const;
type TimerChoice = (typeof TIMER_CHOICES)[number][0];
/** Joueur absent : au bout de combien de temps un bot tire pour lui ; « Jamais » = on l'attend. */
const AFK_CHOICES = [
  ['45', 'Après 45 s'],
  ['90', 'Après 90 s'],
  ['none', 'Jamais'],
] as const;
type AfkChoice = (typeof AFK_CHOICES)[number][0];

function Seg<T extends string>({
  value,
  options,
  onChange,
  sub = false,
}: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
  /** Un choix qui précise le précédent, dans le même champ : plus bas. */
  sub?: boolean;
}) {
  return (
    <div className={sub ? 'seg sub' : 'seg'}>
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

/**
 * Création d'une partie, sur l'écran qui deviendra l'écran central : un
 * ordinateur ou une tablette, donc un format large, réglages à gauche et
 * récapitulatif à droite. Tailles tactiles qui grandissent avec l'écran, et
 * tout tient sans défilement en paysage dès 1024×700 (tablette) ou 1280×610.
 * Un smartphone est renvoyé vers l'accueil.
 */
export function CreateGame() {
  const navigate = useNavigate();
  const phone = useMedia(PHONE_QUERY);
  const [variant, setVariant] = useState<Variant>('sequential');
  const [endCondition, setEndCondition] = useState<EndCondition>('last_standing');
  const [maxPlayers, setMaxPlayers] = useState(4);
  // Null tant que l'hôte n'a pas choisi : la grille suit alors le nombre de joueurs.
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [sunkReveal, setSunkReveal] = useState<SunkReveal>('classic');
  const [timer, setTimer] = useState<TimerChoice>('none');
  const [timerTouched, setTimerTouched] = useState(false);
  const [salvoOrder, setSalvoOrder] = useState<SalvoOrder>('commit');
  const [afk, setAfk] = useState<AfkChoice>('45');
  const afkBotSeconds = afk === 'none' ? null : Number(afk);
  const [commanders, setCommanders] = useState(false);
  // Les éliminés : sans objet à deux joueurs ou à la première flotte coulée, la partie s'arrête avant.
  const [eliminated, setEliminated] = useState<EliminatedRole>('ghosts');
  const eliminatedShown = maxPlayers >= 3 && endCondition === 'last_standing';
  // Anti-acharnement : sans objet à deux joueurs, le champ n'apparaît qu'à partir de trois.
  const [antiFocus, setAntiFocus] = useState<AntiFocusChoice>('none');
  const antiFocusMaxStreak = maxPlayers >= 3 && antiFocus !== 'none' ? Number(antiFocus) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectivePreset = preset ?? defaultPresetFor(maxPlayers);
  const { grid, fleet } = PRESETS[effectivePreset];
  const cells = fleet.reduce((n, s) => n + s.size, 0);
  // Aperçu avec le vrai rendu des cases : des ratés, une touche, et un bateau coulé
  // dessiné ou non selon l'option « bateau coulé », comme sur l'écran central.
  const preview = useMemo(() => {
    const sunkCells = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ];
    const revealed = [
      ...sunkCells.map((coord) => ({ coord, result: 'HIT' as const })),
      { coord: { x: 0, y: 0 }, result: 'MISS' as const },
      { coord: { x: 4, y: 3 }, result: 'MISS' as const },
      { coord: { x: 2, y: 5 }, result: 'MISS' as const },
      { coord: { x: 6, y: 2 }, result: 'MISS' as const },
      { coord: { x: 5, y: 4 }, result: 'HIT' as const },
    ];
    const sunkShips = [
      { shipId: 'demo', size: 3, ...(sunkReveal === 'classic' ? { cells: sunkCells } : {}) },
    ];
    return publicGridClasses(revealed, sunkShips);
  }, [sunkReveal]);

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
          antiFocusMaxStreak,
          afkBotSeconds,
          commanders: commanders ? [...COMMANDERS] : [],
          eliminated,
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
    <div className="create">
      <div className="create-wrap">
        <header className="create-head">
          <Wordmark />
          <h1>Nouvelle partie</h1>
          <Link className="btn ghost" to="/">
            Retour
          </Link>
        </header>
        <div className="create-grid">
          <section className="create-form" aria-label="Réglages de la partie">
            <div className="field">
              <span className="label">Variante</span>
              <Seg
                value={variant}
                options={choices(VARIANT_LABELS)}
                onChange={(v) => {
                  setVariant(v);
                  // Proposé par défaut : 45 s en salve, aucun chrono en tour par tour.
                  if (!timerTouched) setTimer(v === 'simultaneous' ? '45' : 'none');
                }}
              />
              {/* En salve, l'ordre de résolution se choisit dans le même champ : le formulaire
                  garde ses quatre rangées et tient sans défilement. */}
              {variant === 'sequential' ? (
                <p className="hint">Un joueur tire à la fois, dans l’ordre des sièges.</p>
              ) : (
                <>
                  <Seg
                    value={salvoOrder}
                    options={choices(SALVO_ORDER_LABELS)}
                    onChange={setSalvoOrder}
                    sub
                  />
                </>
              )}
            </div>
            <div className="field">
              <span className="label">Grille et flotte</span>
              <Seg value={effectivePreset} options={choices(PRESET_LABELS)} onChange={setPreset} />
              <p className="hint">
                {fleetSummary(fleet)} · {cells} cases.
              </p>
            </div>
            <div className="field">
              <span className="label">Chrono par manche</span>
              <Seg
                value={timer}
                options={TIMER_CHOICES}
                onChange={(v) => {
                  setTimer(v);
                  setTimerTouched(true);
                }}
              />
              <p className="hint">
                {timer === 'none'
                  ? 'L’hôte peut toujours passer un tour.'
                  : variant === 'sequential'
                    ? 'À l’échéance, le tour passe.'
                    : 'À l’échéance, la salve se résout.'}
              </p>
            </div>
            <div className="field">
              <span className="label">Bot pour un absent</span>
              <Seg value={afk} options={AFK_CHOICES} onChange={setAfk} />
              <p className="hint">
                {afk === 'none'
                  ? 'On attend un joueur déconnecté.'
                  : 'Il tire pour lui jusqu’à son retour.'}
              </p>
            </div>
            {maxPlayers >= 3 && (
              <div className="field">
                <span className="label">Acharnement</span>
                <Seg value={antiFocus} options={ANTI_FOCUS_CHOICES} onChange={setAntiFocus} />
                <p className="hint">
                  {antiFocus === 'none'
                    ? 'Chacun vise qui il veut, autant qu’il veut.'
                    : antiFocus === '1'
                      ? 'On ne vise jamais le même joueur deux manches de suite.'
                      : 'Après deux tirs de suite sur le même joueur, il faut en viser un autre.'}
                </p>
              </div>
            )}
            <div className="field">
              <span className="label">Commandants</span>
              <Seg
                value={commanders ? 'on' : 'off'}
                options={[
                  ['off', 'Sans'],
                  ['on', 'Avec'],
                ]}
                onChange={(v) => setCommanders(v === 'on')}
              />
              <p className="hint">
                {commanders
                  ? 'Une capacité chacun, bots compris, une fois.'
                  : 'Au tir seulement, sans capacité spéciale.'}
              </p>
            </div>
            {/* « Fantômes » partage la case des joueurs : le formulaire garde ses quatre rangées et
                tient sans défilement. */}
            <div className="field-pair">
              <div className="field">
                <span className="label">Joueurs</span>
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
              {eliminatedShown && (
                <div className="field">
                  <span className="label">Fantômes</span>
                  <Seg
                    value={eliminated}
                    options={[
                      ['spectators', 'Sans'],
                      ['ghosts', 'Avec'],
                    ]}
                    onChange={setEliminated}
                  />
                </div>
              )}
            </div>
            <div className="field">
              <span className="label">Fin de partie</span>
              <Seg value={endCondition} options={choices(END_LABELS)} onChange={setEndCondition} />
            </div>
          </section>
          <aside className="create-summary panel" aria-label="Récapitulatif">
            <h2>Ta table</h2>
            <p className="recap muted">
              {[
                VARIANT_LABELS[variant],
                END_LABELS[endCondition],
                `jusqu’à ${maxPlayers} joueurs`,
                `grille ${grid.width} × ${grid.height}`,
                `${count(fleet.length, 'bateau', 'bateaux')}, ${count(cells, 'case')}`,
                timer === 'none' ? 'sans chrono' : `chrono ${timer} s`,
                afkBotLabel(afkBotSeconds).toLowerCase(),
                ...(commanders ? ['commandants'] : []),
                ...(antiFocusMaxStreak !== null
                  ? [antiFocusLabel(antiFocusMaxStreak).toLowerCase()]
                  : []),
                ...(variant === 'simultaneous'
                  ? [SALVO_ORDER_LABELS[salvoOrder].toLowerCase()]
                  : []),
              ].join(' · ')}
            </p>
            <Grid
              width={grid.width}
              height={grid.height}
              cellClass={preview}
              label={`Aperçu d’une grille ${grid.width}×${grid.height} sur l’écran central`}
            />
            {/* Sous l'aperçu qu'il change, qui montre l'effet : le formulaire garde quatre rangées et tient sans défilement. */}
            <div className="field">
              <span className="label">Bateau coulé</span>
              <Seg
                value={sunkReveal}
                options={choices(SUNK_REVEAL_LABELS)}
                onChange={setSunkReveal}
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
            <p className="hint after">Il affichera le QR code des téléphones.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
