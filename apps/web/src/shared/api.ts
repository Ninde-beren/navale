import type {
  CreateGameRequest,
  CreateGameResponse,
  Feedback,
  HostLink,
  HostLinkRequest,
  Replay,
} from '@navale/protocol';

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
  // 204 : rien à lire, la demande a réussi.
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  createGame: (body: CreateGameRequest) =>
    call<CreateGameResponse>('/api/games', { method: 'POST', body: JSON.stringify(body) }),
  /** Le journal d'une partie terminée, pour la revoir. */
  replay: (gameId: string) => call<Replay>(`/api/games/${encodeURIComponent(gameId)}/replay`),
  /** Le lien d'hôte et son QR, pour donner les boutons de l'hôte à un autre appareil. */
  hostLink: (code: string, body: HostLinkRequest) =>
    call<HostLink>(`/api/games/${encodeURIComponent(code)}/host-link`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Le lien d'hôte s'est ouvert ici : le serveur vérifie le jeton (et le note, anonymement). */
  openHostLink: (code: string, body: HostLinkRequest) =>
    call<void>(`/api/games/${encodeURIComponent(code)}/host-link/opened`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  sendFeedback: (body: Feedback) =>
    call<{ ok: true; id: number }>('/api/feedback', { method: 'POST', body: JSON.stringify(body) }),
};
