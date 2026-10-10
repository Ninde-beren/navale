import {
  duration,
  esc,
  hbars,
  num,
  oneDecimal,
  percent,
  shell,
  tile,
  TIME_ZONE,
} from './layout.js';
import type { Breakdown, UsageStats } from './usage.js';

/** Les périodes proposées, de la plus large à la plus étroite ; `null` jours = tout l'historique. */
export const PERIODS = [
  { id: 'tout', days: null, label: 'Depuis le début' },
  { id: '30', days: 30, label: '30 derniers jours' },
  { id: '7', days: 7, label: '7 derniers jours' },
] as const;
export type PeriodId = (typeof PERIODS)[number]['id'];

/** En dessous, un taux de victoire ne dit pas grand-chose : il est grisé. */
const FEW_GAMES = 5;

const day = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function breakdownCard(b: Breakdown): string {
  return `<div class="card">
        <h3>${esc(b.title)}</h3>
        ${hbars(b.rows, b.unit)}
      </div>`;
}

function configurationsTable(stats: UsageStats): string {
  if (stats.configurations.length === 0)
    return '<p class="empty">Aucune partie jouée sur la période.</p>';
  const rows = stats.configurations
    .map(
      (c) => `<tr>
            <td class="wrap">${esc(c.label)}</td>
            <td class="num">${num.format(c.games)}</td>
            <td class="num">${percent(c.games, stats.games)}</td>
            <td class="num">${c.meanMs === null ? '<span class="muted">—</span>' : duration(c.meanMs)}</td>
          </tr>`,
    )
    .join('');
  return `<div class="scroll"><table>
        <thead><tr><th>Configuration</th><th class="num">Parties</th><th class="num">Part</th><th class="num">Durée moyenne</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

function optionsTable(stats: UsageStats): string {
  const rows = stats.options
    .map(
      (o) => `<tr>
            <td class="wrap">${esc(o.label)}</td>
            <td class="num">${num.format(o.games)} / ${num.format(o.of)}</td>
            <td class="num">${percent(o.games, o.of)}</td>
          </tr>`,
    )
    .join('');
  return `<div class="scroll"><table>
        <thead><tr><th>Option activée</th><th class="num">Parties</th><th class="num">Part</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

function commandersTable(stats: UsageStats): string {
  if (stats.commanders.rows.length === 0)
    return '<p class="empty">Aucune partie avec commandants sur la période.</p>';
  const rows = stats.commanders.rows
    .map((c) => {
      const rate = percent(c.wins, c.finished);
      return `<tr>
            <td>${esc(c.name)}</td>
            <td class="num">${num.format(c.humanPicks)}</td>
            <td class="num">${num.format(c.botPicks)}</td>
            <td class="num">${num.format(c.wins)} / ${num.format(c.finished)}</td>
            <td class="num">${c.finished < FEW_GAMES ? `<span class="muted" title="Moins de ${FEW_GAMES} parties terminées">${rate}</span>` : rate}</td>
          </tr>`;
    })
    .join('');
  return `<div class="scroll"><table>
        <thead><tr>
          <th>Commandant</th>
          <th class="num">Choisi par un humain</th>
          <th class="num">Tiré par un bot</th>
          <th class="num" title="Victoires / sièges dans des parties terminées">Victoires</th>
          <th class="num">Taux de victoire</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

export interface UsagePageInput {
  stats: UsageStats;
  period: PeriodId;
  now: number;
  version: string;
}

/** Statistiques d'utilisation : ce qui se joue, avec qui, combien de temps, sur place ou à distance. */
export function renderUsagePage({ stats, period, now, version }: UsagePageInput): string {
  const periods = PERIODS.map(
    (p) =>
      `<a href="/admin/statistiques${p.id === 'tout' ? '' : `?periode=${p.id}`}"${p.id === period ? ' aria-current="page"' : ''}>${p.label}</a>`,
  ).join('');
  const seats = stats.seats.humans + stats.seats.bots;
  const r = stats.remote;
  const physical = r.measured - r.remote;
  const since = day.format(r.since);
  const h = stats.hostLink;
  const commanders = stats.commanders.rows;
  const humanPicks = commanders.reduce((n, c) => n + c.humanPicks, 0);
  const favourite = commanders[0]?.humanPicks ? commanders[0] : null;
  // Le meilleur taux parmi les commandants assez joués pour qu'il veuille dire quelque chose.
  const winner =
    commanders
      .filter((c) => c.finished >= FEW_GAMES)
      .sort((a, b) => b.wins / b.finished - a.wins / a.finished || b.finished - a.finished)[0] ??
    null;

  return shell({
    active: 'stats',
    lead: `Calculé le ${day.format(now)} à partir du journal des parties · version ${esc(version)}`,
    body: `
    <nav class="periods" aria-label="Période">${periods}</nav>

    <h2>Vue d’ensemble</h2>
    <div class="tiles">
      ${tile('usage-games', stats.games, 'Parties jouées', `dont ${num.format(stats.finished)} terminées`)}
      ${tile('usage-duration', stats.durationMs ? duration(stats.durationMs.mean) : '—', 'Durée moyenne d’une partie', stats.durationMs ? `médiane ${duration(stats.durationMs.median)}` : 'aucune partie terminée')}
      ${tile('usage-session', stats.sessions.count ? oneDecimal(stats.sessions.meanGames) : '—', 'Parties par session', `${num.format(stats.sessions.count)} sessions`)}
      ${tile('usage-humans', percent(stats.seats.humans, seats), 'Places tenues par des humains', `${num.format(stats.seats.humans)} humains · ${num.format(stats.seats.bots)} bots`)}
    </div>
    <p class="note">Une partie compte dès son lancement. Une session, c’est une partie et ses revanches à la suite. La durée va du lancement à la fin, pour les parties terminées.</p>

    <h2>Joueurs</h2>
    <div class="cards">
      ${breakdownCard(stats.humansPerGame)}
      ${breakdownCard(stats.sessions.lengths)}
      ${breakdownCard(stats.botLevels)}
    </div>
    <p class="note">${num.format(stats.seats.gamesWithBots)} parties sur ${num.format(stats.games)} avec au moins un bot. Le niveau compte chaque siège tenu par un bot.</p>

    <h2>Configurations</h2>
    <div class="card">
      <h3>Les plus jouées</h3>
      ${configurationsTable(stats)}
      <p class="note">Mode, plateau, nombre de joueurs à table (bots compris) et commandants. Les ${stats.configurations.length} premières.</p>
    </div>
    <div class="cards wide">
      ${stats.settings.map(breakdownCard).join('')}
    </div>
    <div class="card">
      <h3>Options</h3>
      ${optionsTable(stats)}
      <p class="note">Chaque option est comptée parmi les parties où elle a un sens : l’anti-acharnement et les fantômes à partir de trois joueurs, l’ordre de résolution en salve.</p>
    </div>

    <h2>Commandants</h2>
    <div class="tiles">
      ${tile('usage-commander-picked', favourite ? favourite.name : '—', 'Le plus choisi par les humains', favourite ? `${num.format(favourite.humanPicks)} fois sur ${num.format(humanPicks)}` : 'aucun choix sur la période')}
      ${tile('usage-commander-wins', winner ? winner.name : '—', 'Gagne le plus', winner ? `${percent(winner.wins, winner.finished)} de victoires sur ${num.format(winner.finished)} parties terminées` : `aucun commandant joué ${FEW_GAMES} fois jusqu’au bout`)}
    </div>
    <div class="card">
      <h3>${num.format(stats.commanders.games)} parties avec commandants</h3>
      ${commandersTable(stats)}
      <p class="note">Les humains choisissent leur commandant, les bots le tirent au hasard. Le taux de victoire compte tous les sièges, humains et bots, dans les parties terminées ; il est grisé sous ${FEW_GAMES} parties.</p>
    </div>

    <h2>Sur place ou à distance</h2>
    <div class="tiles">
      ${tile('usage-remote', percent(r.remote, r.measured), 'Parties à distance', `${num.format(r.remote)} sur ${num.format(r.measured)} : l’écran ouvert sur un autre appareil`)}
      ${tile('usage-physical', percent(physical, r.measured), 'Parties sur place', `${num.format(physical)} : un seul écran, celui de l’hôte`)}
      ${tile('usage-shared', percent(r.shared, r.measured), 'Lien de l’écran partagé', `${num.format(r.sharedBoard)} depuis l’écran central · ${num.format(r.sharedPhone)} depuis un téléphone`)}
    </div>
    <p class="note">Mesuré depuis le ${since} ; les parties d’avant ne comptent pas ici. « À distance » : l’écran central de la partie s’est ouvert sur un autre appareil que celui de l’hôte, par le lien partagé. « Partagé » : quelqu’un a touché le bouton de partage, que le lien ait servi ou non. Une revanche garde le constat de la partie d’avant. Tes « Voir l’écran » depuis l’administration ne comptent pas.</p>

    <h2>Lien d’hôte</h2>
    <div class="tiles">
      ${tile('usage-host-moved', percent(h.moved, h.measured), 'Hôte passé sur un autre appareil', `${num.format(h.moved)} sur ${num.format(h.measured)} : le lien d’hôte a servi`)}
      ${tile('usage-host-link', percent(h.shown, h.measured), 'Lien d’hôte affiché', `${num.format(h.shown)} parties : l’hôte a ouvert « Changer d’appareil hôte »`)}
    </div>
    <p class="note">Mesuré depuis le ${day.format(h.since)}, la mise en ligne du lien d’hôte. « Affiché » : l’hôte a ouvert le lien depuis l’écran central, qu’il ait servi ou non. « Passé » : un autre appareil a ouvert le lien et pris les boutons de l’hôte ; celui qui l’a montré les garde. Une revanche garde le constat de la partie d’avant.</p>
`,
  });
}
