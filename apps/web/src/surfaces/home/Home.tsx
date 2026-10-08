import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { PHONE_QUERY, useMedia } from '../../shared/useMedia.js';
import { canScan } from './qrCode.js';
import { QrScan } from './QrScan.js';
import { TableScene } from './TableScene.js';

const CODE_RE = /^[A-HJ-NP-Z]{4}$/;

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
              <h1>Bataille navale autour de la table</h1>
              <p className="home-lede">
                L'écran central affiche les grilles. Chacun place ses bateaux et tire depuis son
                téléphone.
              </p>
              {phone ? <JoinForm formRef={joinRef} /> : <CreateAction />}
              <p className="home-facts">De 2 à 4 joueurs, sans appli à installer.</p>
            </div>
            <TableScene />
          </div>
        </div>
      </header>

      <main>
        <section className="home-section" aria-labelledby="home-steps">
          <div className="home-wrap">
            <h2 id="home-steps">Comment on joue</h2>
            <ol className="home-steps">
              <li className="home-step">
                <span className="home-step-n">1</span>
                <h3>Crée la partie</h3>
                <p>Ouvre Navale sur la télé, l'ordinateur ou la tablette que tout le monde voit.</p>
              </li>
              <li className="home-step">
                <span className="home-step-n">2</span>
                <h3>Rejoins avec ton téléphone</h3>
                <p>Scanne le QR code de l'écran central, ou tape le code de 4 lettres.</p>
                <span className="home-code" aria-hidden="true">
                  <b>K</b>
                  <b>R</b>
                  <b>T</b>
                  <b>X</b>
                </span>
              </li>
              <li className="home-step">
                <span className="home-step-n">3</span>
                <h3>Place tes bateaux</h3>
                <p>
                  Glisse un bateau pour le déplacer, tape dessus pour le tourner. Personne d'autre
                  ne voit ta grille.
                </p>
              </li>
              <li className="home-step">
                <span className="home-step-n">4</span>
                <h3>Tire</h3>
                <p>
                  Choisis une case sur ton téléphone. Le résultat s'affiche sur l'écran central.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="home-section" aria-labelledby="home-variants">
          <div className="home-wrap">
            <h2 id="home-variants">Deux façons de jouer</h2>
            <p className="home-section-lede">Tu choisis en créant la partie.</p>
            <div className="home-variants">
              <article className="home-variant">
                <h3>Tour par tour</h3>
                <p>Chacun tire à son tour, comme dans le jeu classique.</p>
                <div className="home-moment" aria-hidden="true">
                  <span className="c-yellow">
                    Au tour de <b>Julie</b>
                  </span>
                </div>
              </article>
              <article className="home-variant">
                <h3>Salve</h3>
                <p>
                  Tout le monde tire en même temps. Les tirs s'affichent ensuite un par un, en
                  commençant par le plus rapide.
                </p>
                <div className="home-moment salvo" aria-hidden="true">
                  <b>3/4</b>
                  <span>ont tiré</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="home-section" aria-labelledby="home-good">
          <div className="home-wrap">
            <h2 id="home-good">Bon à savoir</h2>
            <ul className="home-points">
              <li>C'est le jeu qui annonce touché ou raté. Personne ne peut tricher.</li>
              <li>Tu peux compléter la partie avec des bots, ou jouer seul contre eux.</li>
              <li>Si ton téléphone se met en veille, rouvre-le et tu reprends ta partie.</li>
            </ul>
          </div>
        </section>

        <section className="home-section home-final" aria-labelledby="home-final">
          <div className="home-wrap">
            <h2 id="home-final">On fait une partie ?</h2>
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
      <p className="hint">
        Cet écran deviendra l'écran central. Les joueurs le rejoignent avec leur téléphone.
      </p>
    </div>
  );
}

/** Smartphone : on scanne le QR code de l'écran central, ou on saisit son code. */
function JoinForm({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();
  const valid = CODE_RE.test(code);
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
        maxLength={4}
        placeholder="ABCD"
        value={code}
        onChange={(e) =>
          setCode(
            e.target.value
              .toUpperCase()
              .replace(/[^A-HJ-NP-Z]/g, '')
              .slice(0, 4),
          )
        }
      />
      <button className={`btn ${scan ? '' : 'primary xl'}`} type="submit" disabled={!valid}>
        Rejoindre
      </button>
      <p className="hint">Pour créer une partie, ouvre Navale sur un ordinateur ou une tablette.</p>
    </form>
  );
}
