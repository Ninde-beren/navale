import { ReplayFileSchema, type EventEnvelope, type ReplayFile } from '@navale/protocol';
import { replayScript, type ReplayScript } from './replay.js';

/** Au-delà, un fichier n'est pas une partie : une partie de quatre joueurs pèse quelques centaines de Ko. */
export const REPLAY_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Le fichier d'une partie à exporter : son journal complet, daté. */
export function replayFile(
  game: { gameId: string; code: string; events: EventEnvelope[] },
  now: number = Date.now(),
): ReplayFile {
  return {
    format: 'navale-replay',
    version: 1,
    gameId: game.gameId,
    code: game.code,
    exportedAt: now,
    events: game.events,
  };
}

/** « navale-ABCD-2026-10-10.json » : le code de la partie et le jour de sa fin. */
export function replayFileName(file: ReplayFile): string {
  const end = file.events.at(-1)?.at ?? file.exportedAt;
  return `navale-${file.code}-${new Date(end).toISOString().slice(0, 10)}.json`;
}

/**
 * Lit un fichier exporté : il vient de n'importe où, donc il est validé entièrement
 * (format, version, chaque événement) puis rejoué, avant d'être montré.
 */
export function readReplayFile(
  text: string,
): { ok: true; file: ReplayFile; script: ReplayScript } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas une partie Navale exportée.' };
  }
  const parsed = ReplayFileSchema.safeParse(data);
  if (!parsed.success)
    return {
      ok: false,
      error: 'Ce fichier n’est pas une partie Navale exportée, ou il est abîmé.',
    };
  try {
    return { ok: true, file: parsed.data, script: replayScript(parsed.data.events) };
  } catch {
    return { ok: false, error: 'Cette partie ne se rejoue pas : son journal est incomplet.' };
  }
}

/** Fait télécharger le fichier par le navigateur. */
export function downloadReplayFile(file: ReplayFile): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = replayFileName(file);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
