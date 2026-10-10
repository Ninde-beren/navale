import { battleship, publicEvent, type GameState } from '@navale/engine';
import type { BoardView, EventEnvelope, VisibleEnvelope } from '@navale/protocol';

/** Un pas du replay : un lot d'événements, celui d'une commande, et ce qui en résulte. */
export interface ReplayStep {
  /** Les événements du lot, tels que l'écran central les a reçus. */
  envelopes: VisibleEnvelope[];
  /** L'écran central une fois le lot annoncé. */
  view: BoardView;
  /** L'état complet après le lot : les flottes, que le replay peut montrer. */
  state: GameState;
}

/** Une partie à revoir : l'écran central au lancement, puis chaque lot joué jusqu'à la fin. */
export interface ReplayScript {
  start: ReplayStep;
  steps: ReplayStep[];
}

/** L'écran central d'un replay : la vue publique, chacun connecté, sans boutons d'hôte. */
function boardOf(state: GameState): BoardView {
  const presence = Object.fromEntries(state.players.map((p) => [p.playerId, true]));
  return { ...battleship.projectPublic(state, presence), isHost: false };
}

/**
 * Découpe le journal d'une partie terminée en pas : les événements d'une même commande
 * partagent leur instant (`at`) et forment un lot. Tout ce qui précède le lancement (lobby,
 * placements) se replie dans le premier pas ; chaque lot suivant en est un.
 */
export function replayScript(journal: EventEnvelope[]): ReplayScript {
  const created = journal[0]?.event;
  if (created?.type !== 'GAME_CREATED') throw new Error('journal sans GAME_CREATED');
  let state = battleship.initialState({
    gameId: created.gameId,
    code: created.code,
    settings: created.settings,
    createdAt: created.createdAt,
  });
  let start: ReplayStep | null = null;
  const steps: ReplayStep[] = [];
  for (let i = 0; i < journal.length;) {
    const at = journal[i]!.at;
    const batch: EventEnvelope[] = [];
    while (i < journal.length && journal[i]!.at === at) batch.push(journal[i++]!);
    for (const e of batch) state = battleship.evolve(state, e.event);
    const step: ReplayStep = {
      envelopes: batch.map((e) => ({ ...e, event: publicEvent(e.event) })),
      view: boardOf(state),
      state,
    };
    if (start) steps.push(step);
    else if (batch.some((e) => e.event.type === 'GAME_STARTED')) start = step;
  }
  if (!start) throw new Error('journal sans lancement');
  return { start, steps };
}

/** L'écran central juste avant le pas `k` : le lancement, ou le pas d'avant. */
export function viewBefore(script: ReplayScript, k: number): ReplayStep {
  return k <= 0 ? script.start : (script.steps[k - 1] ?? script.start);
}

/** Le premier pas qui part de la manche `round` ; la fin si elle n'existe pas. */
export function roundStart(script: ReplayScript, round: number): number {
  for (let k = 0; k <= script.steps.length; k++)
    if ((viewBefore(script, k).view.round?.index ?? -1) >= round) return k;
  return script.steps.length;
}

/** Le nombre de manches de la partie. */
export function roundCount(script: ReplayScript): number {
  let max = 0;
  for (const s of [script.start, ...script.steps])
    max = Math.max(max, (s.view.round?.index ?? -1) + 1);
  return max;
}
