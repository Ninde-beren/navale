import type { GameEvent } from '@navale/protocol';
import type { DecideContext } from '../core/definition.js';
import { botReadyEvents } from './bot/arrival.js';
import type { GameState } from './state.js';

/**
 * Journal initial de la revanche (E1-S15) : même code, mêmes réglages, mêmes
 * joueurs avec les mêmes identifiants et les mêmes sièges, en placement ; les
 * bots arrivent prêts avec une flotte neuve. Le serveur ouvre la nouvelle
 * partie avec ces événements et y transfère les jetons.
 */
export function rematchEvents(
  state: GameState,
  newGameId: string,
  ctx: DecideContext,
): GameEvent[] {
  const events: GameEvent[] = [
    {
      type: 'GAME_CREATED',
      gameId: newGameId,
      code: state.code,
      settings: state.settings,
      createdAt: ctx.now,
    },
  ];
  for (const p of [...state.players].sort((a, b) => a.seat - b.seat)) {
    events.push({
      type: 'PLAYER_JOINED',
      playerId: p.playerId,
      name: p.name,
      color: p.color,
      seat: p.seat,
      kind: p.kind,
      ...(p.level ? { level: p.level } : {}),
    });
    if (p.kind === 'bot') events.push(...botReadyEvents(state.settings, p.playerId, ctx.random));
  }
  return events;
}
