import type { GameSettings, PresetId } from '@navale/protocol';

export interface CreateGameRequest {
  settings: Partial<GameSettings> & { variant: GameSettings['variant']; maxPlayers: number };
  preset?: PresetId;
}
export interface CreateGameResponse {
  gameId: string;
  code: string;
  hostToken: string;
  boardUrl: string;
  joinUrl: string;
}
export interface GameInfo {
  gameId: string;
  code: string;
  status: string;
  players: number;
  maxPlayers: number;
  joinable: boolean;
  takenColors: string[];
  takenNames: string[];
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new ApiError(
      body.code ?? 'HTTP_ERROR',
      body.message ?? `Erreur ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export const api = {
  createGame: (body: CreateGameRequest) =>
    call<CreateGameResponse>('/api/games', { method: 'POST', body: JSON.stringify(body) }),
  gameInfo: (code: string) => call<GameInfo>(`/api/games/${encodeURIComponent(code)}`),
};
