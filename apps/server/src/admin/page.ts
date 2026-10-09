import type { FeedbackRecord } from '../store/feedback-store.js';
import type { PlayedOutcome } from '../store/history.js';
import type { HistoryStats, LiveStats, OpenGame } from './stats.js';

/** Période de rafraîchissement de la page, en secondes. */
export const ADMIN_REFRESH_S = 20;

const TIME_ZONE = 'Europe/Paris';
const VARIANT = { sequential: 'Tour par tour', simultaneous: 'Salve' } as const;
const STATUS: Record<OpenGame['status'], string> = { LOBBY: 'Salle d’attente', PLAYING: 'En jeu' };
const OUTCOME: Record<PlayedOutcome, string> = {
  playing: 'En cours',
  finished: 'Terminée',
  cancelled: 'Annulée',
  expired: 'Expirée',
};

const num = new Intl.NumberFormat('fr-FR');
const dayLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
});
const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const clock = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function esc(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function duration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} j`;
}

function ago(at: number, now: number): string {
  return now - at < 60_000 ? 'à l’instant' : `il y a ${duration(now - at)}`;
}

function tile(stat: string, value: number, label: string, detail = ''): string {
  return `<div class="tile">
        <div class="value" data-stat="${stat}">${num.format(value)}</div>
        <div class="label">${label}</div>
        ${detail ? `<div class="detail">${detail}</div>` : ''}
      </div>`;
}

function openGamesTable(live: LiveStats, now: number): string {
  if (live.games.length === 0) return '<p class="empty">Aucune partie ouverte.</p>';
  const rows = live.games
    .map((g) => {
      const online = g.humansConnected + g.otherConnections > 0;
      return `<tr${online ? '' : ' class="idle"'}>
            <td class="code">${esc(g.code)}</td>
            <td><span class="pill ${g.status === 'PLAYING' ? 'pill-on' : ''}">${STATUS[g.status]}</span></td>
            <td>${VARIANT[g.variant]}</td>
            <td class="num">${g.humansConnected} / ${g.humans}</td>
            <td class="num">${g.bots}</td>
            <td class="num">${g.otherConnections}</td>
            <td class="num">${g.humans + g.bots} / ${g.maxPlayers}</td>
            <td>${g.startedAt ? `${duration(now - g.startedAt)} de jeu` : `ouverte ${ago(g.createdAt, now)}`}</td>
            <td>${online ? ago(g.lastActivityAt, now) : 'personne de connecté'}</td>
            <td><a class="btn" href="/board/${esc(g.code)}" target="_blank" rel="noopener noreferrer">Voir l’écran</a></td>
          </tr>`;
    })
    .join('');
  return `<div class="scroll"><table>
        <thead><tr>
          <th>Code</th><th>État</th><th>Mode</th>
          <th class="num" title="Humains connectés / inscrits">Joueurs</th>
          <th class="num">Bots</th>
          <th class="num" title="Écran central, spectateurs, téléphones qui choisissent leur nom">Écrans</th>
          <th class="num">Places</th><th>Depuis</th><th>Dernière action</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

function chart(history: HistoryStats): string {
  const w = 720;
  const h = 200;
  const top = 16;
  const bottom = 22;
  const chartH = h - top - bottom;
  if (history.periodGames === 0)
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Aucune partie">
        <text x="${w / 2}" y="${h / 2}" text-anchor="middle" class="axis">Aucune partie jouée sur la période.</text>
      </svg>`;
  const max = Math.max(...history.days.map((d) => d.games), 1);
  const slot = w / history.days.length;
  const gap = slot * 0.25;
  const bars = history.days
    .map((d, i) => {
      const bh = d.games > 0 ? Math.max(2, (d.games / max) * chartH) : 0;
      const tip = `${d.games} partie${d.games > 1 ? 's' : ''} · ${d.players} joueur${d.players > 1 ? 's' : ''} · ${dayLabel.format(Date.parse(`${d.day}T12:00:00Z`))}`;
      return `<rect class="bar" x="${(i * slot + gap / 2).toFixed(1)}" y="${(top + chartH - bh).toFixed(1)}" width="${(slot - gap).toFixed(1)}" height="${bh.toFixed(1)}" rx="2"><title>${esc(tip)}</title></rect>`;
    })
    .join('');
  const last = history.days.length - 1;
  const labels = [0, Math.floor(last / 2), last]
    .map((i) => {
      const d = history.days[i];
      if (!d) return '';
      const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle';
      const x = i === 0 ? 0 : i === last ? w : i * slot + slot / 2;
      return `<text x="${x.toFixed(1)}" y="${h - 6}" text-anchor="${anchor}" class="axis">${esc(dayLabel.format(Date.parse(`${d.day}T12:00:00Z`)))}</text>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Parties jouées par jour">
        <line x1="0" y1="${top}" x2="${w}" y2="${top}" class="grid" />
        <text x="0" y="${top - 4}" class="axis">${max}</text>
        <line x1="0" y1="${top + chartH}" x2="${w}" y2="${top + chartH}" class="grid" />
        ${bars}
        ${labels}
      </svg>`;
}

function playedTable(history: HistoryStats, now: number): string {
  if (history.recent.length === 0)
    return '<p class="empty">Aucune partie jouée pour l’instant.</p>';
  const rows = history.recent
    .map(
      (g) => `<tr>
            <td>${esc(dateTime.format(g.startedAt))}</td>
            <td class="code">${esc(g.code)}</td>
            <td>${VARIANT[g.variant]}</td>
            <td class="num">${g.humans.length}</td>
            <td class="num">${g.bots}</td>
            <td class="num">${num.format(g.shots)}</td>
            <td class="num">${duration((g.playedUntil ?? now) - g.startedAt)}</td>
            <td><span class="pill pill-${g.outcome}">${OUTCOME[g.outcome]}</span></td>
          </tr>`,
    )
    .join('');
  return `<div class="scroll"><table>
        <thead><tr>
          <th>Lancée le</th><th>Code</th><th>Mode</th>
          <th class="num">Joueurs</th><th class="num">Bots</th><th class="num">Tirs</th>
          <th class="num">Durée</th><th>Issue</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

function feedbackList(feedback: FeedbackRecord[], total: number, mailTo: string | null): string {
  const mail = mailTo
    ? `Chaque retour part aussi par mail à ${esc(mailTo)}.`
    : 'Envoi par mail désactivé (<code>FEEDBACK_TO</code>, ou Mailjet et <code>SMTP_URL</code>, non configurés) : les retours ne se lisent qu’ici.';
  if (feedback.length === 0)
    return `<p class="empty">Aucun retour pour l’instant.</p><p class="note">${mail}</p>`;
  const items = feedback
    .map((f) => {
      const where = [
        f.path,
        f.code ? `partie ${f.code}` : '',
        f.screen ?? '',
        f.version ? `version ${f.version}` : '',
      ]
        .filter(Boolean)
        .map(esc)
        .join(' · ');
      const sent = f.sentAt
        ? '<span class="pill pill-finished">Envoyé par mail</span>'
        : '<span class="pill">Pas envoyé</span>';
      return `<li class="feedback">
          <div class="meta">
            <span>${esc(dateTime.format(f.at))}</span>
            ${f.email ? `<a href="mailto:${esc(f.email)}">${esc(f.email)}</a>` : '<span>sans e-mail</span>'}
            ${sent}
          </div>
          <p class="message">${esc(f.message)}</p>
          <div class="context">${where}</div>
          ${f.userAgent ? `<div class="context">${esc(f.userAgent)}</div>` : ''}
        </li>`;
    })
    .join('');
  const shown =
    feedback.length < total
      ? `Les ${feedback.length} plus récents sur ${num.format(total)}.`
      : 'Tous les retours sont affichés.';
  return `<ul class="feedback-list">${items}</ul><p class="note">${shown} ${mail}</p>`;
}

export interface AdminPageInput {
  live: LiveStats;
  history: HistoryStats;
  feedback: FeedbackRecord[];
  feedbackTotal: number;
  /** Destinataire des retours par mail ; `null` sans SMTP. */
  mailTo: string | null;
  now: number;
  version: string;
}

/** Tableau de bord de l'exploitant : HTML autonome, sans script ni ressource externe. */
export function renderAdminPage({
  live,
  history,
  feedback,
  feedbackTotal,
  mailTo,
  now,
  version,
}: AdminPageInput): string {
  const days = history.days.length;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta http-equiv="refresh" content="${ADMIN_REFRESH_S}" />
<title>Navale · administration</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #080c18;
    --surface-1: #121a2e;
    --surface-2: #192338;
    --line: rgba(241, 237, 227, 0.08);
    --line-strong: rgba(241, 237, 227, 0.18);
    --text: #f1ede3;
    --text-2: #b3b9c9;
    --text-3: #727a90;
    --accent: #ff5a1f;
    --miss: #5fa8e6;
    --ok: #3ddc84;
    --danger: #ff3b5c;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg);
    color: var(--text-2);
    font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  main { max-width: 1040px; margin: 0 auto; padding: 32px 16px 56px; }
  h1, h2, h3 { color: var(--text); margin: 0; letter-spacing: -0.01em; }
  h1 { font-size: 28px; }
  h2 { font-size: 20px; margin: 40px 0 16px; }
  h3 { font-size: 15px; margin-bottom: 14px; }
  .lead { margin: 6px 0 0; color: var(--text-3); font-size: 13px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .tile, .card { background: var(--surface-1); border: 1px solid var(--line); border-radius: 14px; }
  .tile { padding: 18px 20px; }
  .value { color: var(--text); font-size: 40px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .label { color: var(--text-2); font-size: 14px; margin-top: 4px; }
  .detail { color: var(--text-3); font-size: 13px; }
  .card { padding: 20px; margin-bottom: 16px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; white-space: nowrap; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  th { color: var(--text-3); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .code { color: var(--text); font-family: ui-monospace, 'SF Mono', monospace; letter-spacing: 0.08em; }
  tr.idle td { color: var(--text-3); }
  .btn { display: inline-block; padding: 3px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface-2); color: var(--text); font-size: 13px; text-decoration: none; }
  .btn:hover { border-color: var(--miss); color: var(--miss); }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; background: var(--surface-2); color: var(--text-2); }
  .pill-on, .pill-playing { color: var(--accent); }
  .pill-finished { color: var(--ok); }
  .pill-expired, .pill-cancelled { color: var(--text-3); }
  .empty { color: var(--text-3); margin: 0; }
  .note { color: var(--text-3); font-size: 12px; margin: 12px 0 0; }
  .chart { display: block; width: 100%; height: auto; }
  .grid { stroke: var(--line-strong); stroke-width: 1; }
  .bar { fill: var(--miss); }
  .bar:hover { fill: var(--text); }
  .axis { fill: var(--text-3); font: 11px ui-monospace, 'SF Mono', monospace; }
  .feedback-list { list-style: none; margin: 0; padding: 0; }
  .feedback { padding: 14px 0; border-bottom: 1px solid var(--line); }
  .feedback:first-child { padding-top: 0; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; font-size: 13px; color: var(--text-3); }
  .meta a { color: var(--miss); text-decoration: none; overflow-wrap: anywhere; }
  .message { color: var(--text); margin: 6px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .context { color: var(--text-3); font-size: 12px; overflow-wrap: anywhere; }
  code { font-family: ui-monospace, 'SF Mono', monospace; font-size: 0.95em; }
  footer { margin-top: 32px; color: var(--text-3); font-size: 12px; }
  footer a { color: var(--miss); text-decoration: none; }
</style>
</head>
<body>
  <main>
    <h1>Navale · administration</h1>
    <p class="lead">Mis à jour à ${clock.format(now)}, actualisé toutes les ${ADMIN_REFRESH_S} s · version ${esc(version)}</p>

    <h2>En ce moment</h2>
    <div class="tiles">
      ${tile('games-online', live.online, 'Parties en ligne', `${live.onlinePlaying} en jeu · ${live.onlineLobby} en salle d’attente`)}
      ${tile('players-connected', live.playersConnected, 'Joueurs connectés', `${live.playersSeated} inscrits dans ces parties`)}
    </div>
    <div class="card">
      <h3>Parties ouvertes</h3>
      ${openGamesTable(live, now)}
      <p class="note">Une partie est en ligne quand au moins un écran ou un téléphone y est connecté. Les autres attendent leur expiration (2 h en salle d’attente, 6 h en jeu). Joueurs : humains connectés / inscrits. « Voir l’écran » ouvre l’écran central en spectateur, dans un nouvel onglet : la vue publique, sans les boutons de l’hôte ; cet onglet compte lui-même comme un écran connecté.</p>
    </div>

    <h2>Historique</h2>
    <div class="tiles">
      ${tile('games-total', history.totalGames, 'Parties jouées', 'depuis le début')}
      ${tile('players-total', history.totalPlayers, 'Joueurs', 'depuis le début')}
      ${tile('games-period', history.periodGames, `Parties sur ${days} jours`)}
      ${tile('players-period', history.periodPlayers, `Joueurs sur ${days} jours`)}
    </div>
    <div class="card">
      <h3>Parties jouées par jour · ${days} derniers jours</h3>
      ${chart(history)}
    </div>
    <div class="card">
      <h3>Dernières parties jouées</h3>
      ${playedTable(history, now)}
      <p class="note">Une partie compte dès son lancement, revanche comprise. Un joueur compte une fois : la revanche garde les mêmes joueurs, une nouvelle partie en crée de nouveaux. Les ${history.recent.length < history.totalGames ? `${history.recent.length} plus récentes sur ${num.format(history.totalGames)}` : 'parties sont toutes affichées'}.</p>
    </div>

    <h2>Retours</h2>
    <div class="card">
      <h3>Bouton « Un avis, un souci ? » · <span data-stat="feedback-total">${num.format(feedbackTotal)}</span> reçu${feedbackTotal > 1 ? 's' : ''}</h3>
      ${feedbackList(feedback, feedbackTotal, mailTo)}
    </div>

    <footer>Navale · données du journal du serveur, sans cookie ni traceur · <a href="/">Retour au site</a></footer>
  </main>
</body>
</html>`;
}
