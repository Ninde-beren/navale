import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Wordmark } from '../../shared/ui/Wordmark.js';
import { PHONE_QUERY, useMedia } from '../../shared/useMedia.js';

const CODE_RE = /^[A-HJ-NP-Z]{4}$/;

/** Accueil : un smartphone rejoint une partie, un ordinateur ou une tablette en crée une. */
export function Home() {
  const phone = useMedia(PHONE_QUERY);
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const valid = CODE_RE.test(code);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) void navigate(`/play/${code}`);
  };

  return (
    <div className="app-phone" style={{ padding: 24, gap: 32, justifyContent: 'center' }}>
      <div className="flex flex-col items-center gap-3 text-center">
        <Wordmark />
        <h1 className="h1">Bataille navale autour de la table</h1>
        <p className="muted">Un écran au centre, un téléphone par joueur.</p>
      </div>
      {phone ? (
        <form className="field" onSubmit={onSubmit}>
          <span className="label">Rejoindre avec un code</span>
          <input
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
          <button className="btn primary xl" type="submit" disabled={!valid}>
            Rejoindre
          </button>
          <p className="hint">
            Ou scanne le QR code affiché sur l'écran central. La partie se crée depuis un ordinateur
            ou une tablette.
          </p>
        </form>
      ) : (
        <>
          <Link className="btn primary xl" to="/create">
            Créer une partie
          </Link>
          <p className="hint" style={{ textAlign: 'center' }}>
            Cet écran deviendra l'écran central. Les joueurs rejoignent avec leur téléphone, en
            scannant le QR code ou avec le code de la partie.
          </p>
        </>
      )}
    </div>
  );
}
