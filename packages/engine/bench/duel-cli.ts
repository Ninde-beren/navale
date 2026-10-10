import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { BotLevel, Commander, PlayerView, PresetId, Variant } from '@navale/protocol';
import { COMMANDERS } from '../src/battleship/settings.js';
import { WITNESS, duel, type DuelResult, type DuelSide } from './duel.js';

/*
 * pnpm --filter @navale/engine duel [options]
 *
 *   --a <id>           commandant du camp A (défaut : tous les commandants, l'un après l'autre)
 *   --b <id>           commandant du camp B (défaut : temoin, sans capacité)
 *   --games <n>        parties par duel (défaut : 1000)
 *   --seed <n>         graine de la première partie (défaut : 1)
 *   --variant <v>      sequential | simultaneous (défaut : sequential)
 *   --preset <p>       classic | quick (défaut : classic)
 *   --level <l>        easy | normal | hard, pour les deux camps (défaut : normal)
 *   --ships <n>        capacités jouées seulement quand l'adversaire a au plus n bateaux à flot
 *   --commanders <f>   catalogue en JSON (un tableau de commandants) à la place de COMMANDERS
 */

const { values } = parseArgs({
  // pnpm transmet le « -- » éventuel tel quel.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    a: { type: 'string' },
    b: { type: 'string', default: WITNESS.id },
    games: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '1' },
    variant: { type: 'string', default: 'sequential' },
    preset: { type: 'string', default: 'classic' },
    level: { type: 'string', default: 'normal' },
    ships: { type: 'string' },
    commanders: { type: 'string' },
  },
});

const catalogue: Commander[] = values.commanders
  ? (JSON.parse(await readFile(values.commanders, 'utf8')) as Commander[])
  : [...COMMANDERS];
const level = values.level as BotLevel;
const ships = values.ships === undefined ? null : Number(values.ships);
const when =
  ships === null
    ? undefined
    : (view: PlayerView) =>
        view.players.some(
          (p) =>
            p.playerId !== view.me.playerId && p.status === 'ALIVE' && p.shipsRemaining <= ships,
        );
const side = (commanderId: string): DuelSide => ({
  commanderId,
  level,
  ...(when ? { when } : {}),
});

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const num = (x: number | null) => (x === null ? '-' : x.toFixed(1));

function line(a: string, b: string, r: DuelResult): string {
  return [
    `${a.padEnd(11)} contre ${b.padEnd(11)}`,
    `${pct(r.a.rate).padStart(7)} ± ${(r.margin * 100).toFixed(1)}`,
    `nuls ${String(r.draws).padStart(3)}`,
    `tours pour gagner ${num(r.a.turnsToWin)} / ${num(r.b.turnsToWin)}`,
    `usages ${r.a.abilityUses.toFixed(2)} / ${r.b.abilityUses.toFixed(2)}`,
    `manches ${r.rounds.toFixed(1)}`,
  ].join('  ');
}

const firstSides = values.a ? [values.a] : catalogue.map((c) => c.id);
const opts = {
  games: Number(values.games),
  seed: Number(values.seed),
  variant: values.variant as Variant,
  preset: values.preset as PresetId,
  commanders: catalogue,
};
console.log(
  `${opts.games} parties par duel, ${opts.variant}, ${opts.preset}, bots ${level}, graine ${opts.seed}` +
    (ships === null ? '' : `, capacités à ${ships} bateau(x) adverse(s) ou moins`),
);
for (const a of firstSides) {
  const started = Date.now();
  const result = duel({ ...opts, a: side(a), b: side(values.b) });
  console.log(`${line(a, values.b, result)}  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}
