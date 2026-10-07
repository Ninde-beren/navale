import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Wordmark } from '../../shared/ui/Wordmark.js';

const CODE_RE = /^[A-HJ-NP-Z]{4}$/;

export function Home() {
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
      <Link className="btn primary xl" to="/create">
        Créer une partie
      </Link>
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
        <button className="btn" type="submit" disabled={!valid}>
          Rejoindre
        </button>
        <p className="hint">Ou scanne le QR code affiché sur l'écran central.</p>
      </form>
    </div>
  );
}
