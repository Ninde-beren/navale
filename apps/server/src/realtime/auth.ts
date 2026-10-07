import { z } from 'zod';
import type { GameRegistry } from '../store/registry.js';
import type { GameRuntime } from '../runtime/game-runtime.js';
import { isValidCode, normalizeCode } from '../runtime/codes.js';
import type { SocketData } from '../runtime/publisher.js';

export const AuthSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('board'), code: z.string(), hostToken: z.string().optional() }),
  z.object({
    kind: z.literal('player'),
    code: z.string().optional(),
    token: z.string(),
    hostToken: z.string().optional(),
  }),
  z.object({ kind: z.literal('host'), token: z.string() }),
  z.object({ kind: z.literal('join'), code: z.string() }),
]);
export type SocketAuth = z.infer<typeof AuthSchema>;

export class AuthError extends Error {
  constructor(
    public readonly code: 'BAD_REQUEST' | 'CODE_UNKNOWN' | 'TOKEN_INVALID' | 'GAME_NOT_JOINABLE',
    message: string,
  ) {
    super(message);
  }
}

/** Jeton de la connexion → partie et rôle. Rien d'autre ne décide qui est l'acteur. */
export function resolveAuth(
  raw: unknown,
  registry: GameRegistry,
): { runtime: GameRuntime; data: SocketData } {
  const parsed = AuthSchema.safeParse(raw);
  if (!parsed.success) throw new AuthError('BAD_REQUEST', 'Paramètres de connexion invalides.');
  const auth = parsed.data;

  const byCode = (code: string): GameRuntime => {
    const c = normalizeCode(code);
    const runtime = isValidCode(c) ? registry.byActiveCode(c) : undefined;
    if (!runtime) throw new AuthError('CODE_UNKNOWN', 'Aucune partie avec ce code.');
    return runtime;
  };
  const hostOf = (token: string | undefined, gameId?: string): GameRuntime | null => {
    if (!token) return null;
    const rec = registry.resolveToken(token);
    if (!rec || rec.role !== 'host') throw new AuthError('TOKEN_INVALID', 'Jeton d’hôte invalide.');
    if (gameId && rec.gameId !== gameId)
      throw new AuthError('TOKEN_INVALID', 'Ce jeton d’hôte est celui d’une autre partie.');
    const runtime = registry.get(rec.gameId);
    if (!runtime) throw new AuthError('TOKEN_INVALID', 'Partie introuvable.');
    return runtime;
  };

  switch (auth.kind) {
    case 'board': {
      const host = hostOf(auth.hostToken);
      const runtime = host ?? byCode(auth.code);
      return { runtime, data: { gameId: runtime.gameId, playerId: null, isHost: host !== null } };
    }
    case 'host': {
      const runtime = hostOf(auth.token);
      if (!runtime) throw new AuthError('TOKEN_INVALID', 'Jeton d’hôte invalide.');
      return { runtime, data: { gameId: runtime.gameId, playerId: null, isHost: true } };
    }
    case 'player': {
      const rec = registry.resolveToken(auth.token);
      if (!rec || rec.role !== 'player' || !rec.playerId)
        throw new AuthError('TOKEN_INVALID', 'Jeton de joueur invalide.');
      const runtime = registry.get(rec.gameId);
      if (!runtime) throw new AuthError('TOKEN_INVALID', 'Partie introuvable.');
      if (!runtime.state.players.some((p) => p.playerId === rec.playerId))
        throw new AuthError('TOKEN_INVALID', 'Tu ne fais plus partie de cette partie.');
      const host = hostOf(auth.hostToken, runtime.gameId);
      return {
        runtime,
        data: { gameId: runtime.gameId, playerId: rec.playerId, isHost: host !== null },
      };
    }
    case 'join': {
      const runtime = byCode(auth.code);
      if (runtime.state.status !== 'LOBBY')
        throw new AuthError('GAME_NOT_JOINABLE', 'La partie a déjà commencé.');
      return { runtime, data: { gameId: runtime.gameId, playerId: null, isHost: false } };
    }
  }
}
