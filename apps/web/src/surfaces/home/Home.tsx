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
              <h1>La bataille navale qui se joue autour de la table.</h1>
              <p className="home-lede">
                Un écran au centre pour tout le monde, un téléphone par joueur pour ses secrets.
              </p>
              {phone ? <JoinForm formRef={joinRef} /> : <CreateAction />}
              <p className="home-facts">
                <span>2 à 4 joueurs</span>
                <span>Sans compte</span>
                <span>Sans installation</span>
                <span>Tour par tour ou salve</span>
              </p>
            </div>
            <TableScene />
          </div>
        </div>
      </header>

      <main>
        <section className="home-section" aria-labelledby="home-steps">
          <div className="home-wrap">
            <h2 id="home-steps">Une partie, de la création au premier tir</h2>
            <ol className="home-steps">
              <li className="home-step">
                <span className="home-step-n">1</span>
                <h3>Crée la partie sur l'écran central</h3>
                <p>
                  Une TV, un portable ou une tablette que toute la table voit. Tu choisis la
                  variante, le nombre de joueurs et la flotte.
                </p>
              </li>
              <li className="home-step">
                <span className="home-step-n">2</span>
                <h3>Chacun rejoint avec son téléphone</h3>
                <p>
                  En scannant le QR code, ou en tapant le code de 4 lettres. Ni I ni O, pour qu'on
                  ne les confonde jamais.
                </p>
                <span className="home-code" aria-hidden="true">
                  <b>K</b>
                  <b>R</b>
                  <b>T</b>
                  <b>X</b>
                </span>
              </li>
              <li className="home-step">
                <span className="home-step-n">3</span>
                <h3>Place ta flotte en secret</h3>
                <p>
                  Au doigt, sur ton téléphone : glisse pour déplacer, tape pour pivoter. Personne
                  d'autre ne la voit, pas même l'écran central.
                </p>
              </li>
              <li className="home-step">
                <span className="home-step-n">4</span>
                <h3>Tire, puis lève les yeux</h3>
                <p>
                  Tu vises depuis ton téléphone, le serveur arbitre, et le résultat s'affiche en
                  grand sur l'écran central, pour tout le monde.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="home-section" aria-labelledby="home-variants">
          <div className="home-wrap">
            <h2 id="home-variants">Deux façons de jouer</h2>
            <p className="home-section-lede">
              La variante se choisit à la création de la partie. Le reste ne change pas.
            </p>
            <div className="home-variants">
              <article className="home-variant">
                <h3>Tour par tour</h3>
                <p>
                  Un joueur tire à la fois, dans l'ordre de la table. Il choisit un adversaire, une
                  case, confirme, et toute la table suit le tir sur l'écran central.
                </p>
                <div className="home-moment" aria-hidden="true">
                  <span className="c-yellow">
                    Au tour de <b>Julie</b>
                  </span>
                </div>
              </article>
              <article className="home-variant">
                <h3>Salve</h3>
                <p>
                  À chaque manche, tout le monde tire en même temps, en secret. Quand le dernier a
                  tiré, l'écran déroule les tirs un par un, le plus rapide d'abord. À quatre, la
                  partie va quatre fois plus vite.
                </p>
                <div className="home-moment salvo" aria-hidden="true">
                  <b>3/4</b>
                  <span>ont tiré</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="home-section" aria-labelledby="home-table">
          <div className="home-wrap">
            <h2 id="home-table">Ni paravent, ni arbitre</h2>
            <dl className="home-points">
              <div>
                <dt>Ta flotte reste dans ta poche</dt>
                <dd>
                  Elle n'existe que sur ton téléphone. L'écran central n'en reçoit jamais rien.
                </dd>
              </div>
              <div>
                <dt>Personne ne peut tricher</dt>
                <dd>
                  Chaque tir est calculé par le serveur, ni par les joueurs ni par leurs téléphones.
                </dd>
              </div>
              <div>
                <dt>Seul ? Ajoute des bots</dt>
                <dd>
                  « Ajouter un bot » sur l'écran central, avant de lancer la partie. Ils jouent à un
                  rythme humain, avec la même information qu'un joueur.
                </dd>
              </div>
              <div>
                <dt>Ton téléphone s'est mis en veille</dt>
                <dd>
                  Rouvre-le : tu retrouves ta partie en quelques secondes, sans rien ressaisir.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="home-section home-final" aria-labelledby="home-final">
          <div className="home-wrap">
            <h2 id="home-final">Tout le monde est à table ?</h2>
            {phone ? (
              <>
                <p className="home-section-lede">
                  Le QR code et le code de la partie s'affichent sur l'écran central.
                </p>
                <button className="btn primary xl" type="button" onClick={goToJoin}>
                  Rejoindre la partie
                </button>
              </>
            ) : (
              <>
                <p className="home-section-lede">
                  Lance la partie sur l'écran que tout le monde voit.
                </p>
                <Link className="btn primary xl" to="/create">
                  Créer une partie
                </Link>
              </>
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
        Cet écran deviendra l'écran central. Les joueurs rejoignent avec leur téléphone, en scannant
        le QR code ou avec le code de la partie.
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
      <p className="hint">
        Le QR code et le code sont affichés sur l'écran central. La partie se crée depuis un
        ordinateur ou une tablette.
      </p>
    </form>
  );
}
