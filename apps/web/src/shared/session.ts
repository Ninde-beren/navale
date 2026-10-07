/** Jetons et identifiants par code de partie, dans le navigateur. Jamais envoyés ailleurs qu'au serveur. */
export interface Session {
  gameId?: string;
  hostToken?: string;
  playerToken?: string;
  playerId?: string;
}

const KEY = 'navale.sessions';

function readAll(): Record<string, Session> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Session>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Session>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // stockage indisponible (navigation privée…) : la session ne survivra pas au rechargement
  }
}

export function getSession(code: string): Session {
  return readAll()[code.toUpperCase()] ?? {};
}

export function saveSession(code: string, patch: Session): Session {
  const all = readAll();
  const key = code.toUpperCase();
  all[key] = { ...all[key], ...patch };
  writeAll(all);
  return all[key]!;
}

export function clearPlayer(code: string): void {
  const all = readAll();
  const key = code.toUpperCase();
  if (all[key]) {
    delete all[key].playerToken;
    delete all[key].playerId;
    writeAll(all);
  }
}
