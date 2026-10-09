import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router';
import clsx from 'clsx';
import { GAME_CODE_LENGTH, isGameCode } from '@navale/protocol';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { PHONE_QUERY, useMedia } from '../../shared/useMedia.js';
import { canScan, typedCode } from './qrCode.js';
import { QrScan } from './QrScan.js';
import { TableScene } from './TableScene.js';

/**
 * Accueil et page vitrine. Le haut de page sert l'action : un smartphone rejoint une
 * partie, un ordinateur ou une tablette en crée une. La suite explique le jeu à qui
 * arrive par un lien partagé, et se termine par la même action.
 */
export function Home() {
  const phone = useMedia(PHONE_QUERY);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const joinRef = useRef<HTMLFormElement>(null);

  /** Bas de page sur téléphone : retour au formulaire, focus sur sa première action. */
  const goToJoin = () => {
    const form = joinRef.current;
    if (!form) return;
    form.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    form.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
  };

  return (
    <div className="home">
      <header className="home-hero">
        <div className="home-wrap">
          <div className="home-top">
            <Wordmark />
          </div>
          <div className="home-hero-grid">
            <div className="home-hero-text">
              <h1>Coule tes amis autour de la table</h1>
              <p className="home-lede">
                Tout le monde connaît la bataille navale. Sauf qu'ici, on peut y jouer à quatre.
              </p>
              {phone ? <JoinForm formRef={joinRef} /> : <CreateAction />}
            </div>
            <TableScene />
          </div>
        </div>
      </header>

      <main>
        <section className="home-section" aria-labelledby="home-better">
          <div className="home-wrap">
            <h2 id="home-better">Mieux que la version papier</h2>
            <ul className="home-perks">
              <li>
                <h3>Jusqu'à quatre joueurs</h3>
                <p>Chacun vise qui il veut, alors méfie-toi de ton allié du moment.</p>
              </li>
              <li>
                <h3>Fini les « t'es sûr que c'est raté ? »</h3>
                <p>
                  Navale retient la position de tous les bateaux et annonce chaque tir. Pas de
                  triche possible.
                </p>
              </li>
              <li>
                <h3>Un vrai jeu de société</h3>
                <p>
                  Tout le monde se retrouve autour de la même table. C'est le jeu parfait pour une
                  soirée entre amis.
                </p>
              </li>
            </ul>
          </div>
        </section>

        <section className="home-section" aria-labelledby="home-variants">
          <div className="home-wrap">
            <h2 id="home-variants">Choisis ton rythme</h2>
            <div className="home-variants">
              <article className="home-variant">
                <h3>Tour par tour</h3>
                <p>Le grand classique. Chacun tire à son tour.</p>
                <div className="home-moment" aria-hidden="true">
                  <span className="c-yellow">
                    Au tour de <b>Julie</b>
                  </span>
                </div>
              </article>
              <article className="home-variant">
                <h3>Salve</h3>
                <p>Tout le monde tire en même temps. Le plus rapide frappe en premier.</p>
                <div className="home-moment salvo" aria-hidden="true">
                  <b>3/4</b>
                  <span>ont tiré</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="home-section" aria-labelledby="home-ready">
          <div className="home-wrap home-ready">
            <div>
              <h2 id="home-ready">Prêt en une minute</h2>
              <p className="home-section-lede">
                Lance une partie depuis une tablette, un PC ou une TV.
              </p>
              <p className="home-section-lede">
                Sur ton smartphone, scanne le QR code de l'écran central ou saisis le code de la
                partie.
              </p>
              <p className="home-section-lede">Il manque du monde ? Ajoute des bots.</p>
            </div>
            <span className="home-code" aria-hidden="true">
              <b>K</b>
              <b>R</b>
              <b>T</b>
              <b>X</b>
            </span>
          </div>
        </section>

        <section className="home-section home-final" aria-labelledby="home-final">
          <div className="home-wrap">
            <h2 id="home-final">Qui coule qui ce soir ?</h2>
            {phone ? (
              <button className="btn primary xl" type="button" onClick={goToJoin}>
                Rejoindre la partie
              </button>
            ) : (
              <Link className="btn primary xl" to="/create">
                Créer une partie
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/** Ordinateur ou tablette : cet écran deviendra l'écran central. */
function CreateAction() {
  return (
    <div className="home-action">
      <Link className="btn primary xl" to="/create">
        Créer une partie
      </Link>
      <p className="hint">C'est gratuit.</p>
    </div>
  );
}

/** Smartphone : on scanne le QR code de l'écran central, ou on saisit son code. */
function JoinForm({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();
  const valid = isGameCode(code);
  const scan = canScan();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) void navigate(`/play/${code}`);
  };

  return (
    <form ref={formRef} className="home-action field" onSubmit={onSubmit}>
      {scanning && (
        <QrScan onCode={(c) => void navigate(`/play/${c}`)} onClose={() => setScanning(false)} />
      )}
      {scan && (
        <button className="btn primary xl" type="button" onClick={() => setScanning(true)}>
          Scanner le QR code
        </button>
      )}
      <label className="label" htmlFor="home-code">
        {scan ? 'Ou saisis le code' : 'Rejoindre avec un code'}
      </label>
      <input
        id="home-code"
        className="input code"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={GAME_CODE_LENGTH}
        placeholder="ABCD"
        value={code}
        onChange={(e) => setCode(typedCode(e.target.value))}
      />
      <button className={clsx('btn', !scan && 'primary xl')} type="submit" disabled={!valid}>
        Rejoindre
      </button>
      <p className="hint">
        Pour lancer une partie, ouvre Navale sur une tablette ou un ordinateur.
      </p>
    </form>
  );
}
