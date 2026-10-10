/** Ce que partagent les pages de l'administration : en-tête, navigation, style et formats. */

export const TIME_ZONE = 'Europe/Paris';

export const num = new Intl.NumberFormat('fr-FR');
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function esc(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export function duration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} j`;
}

/** Une part en pour cent, sans décimale ; un tiret quand il n'y a rien à partager. */
export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : '—';
}

export function oneDecimal(value: number): string {
  return decimal.format(value);
}

/** Une tuile : la valeur déjà formatée, repérée par `data-stat` pour les tests. */
export function tile(stat: string, value: number | string, label: string, detail = ''): string {
  return `<div class="tile">
        <div class="value${typeof value === 'string' && /^\p{L}/u.test(value) ? ' word' : ''}" data-stat="${stat}">${typeof value === 'number' ? num.format(value) : esc(value)}</div>
        <div class="label">${label}</div>
        ${detail ? `<div class="detail">${detail}</div>` : ''}
      </div>`;
}

/** Barres horizontales d'une seule couleur : une répartition, la valeur au bout de chaque barre. */
export function hbars(rows: Array<{ label: string; count: number }>, unit: string): string {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (total === 0) return '<p class="empty">Aucune donnée sur la période.</p>';
  const max = Math.max(...rows.map((r) => r.count));
  return `<div class="hbars" role="list">${rows
    .map(
      (
        r,
      ) => `<div class="hbar-row" role="listitem" title="${esc(`${r.label} : ${num.format(r.count)} ${unit} sur ${num.format(total)}`)}">
          <span class="hbar-label">${esc(r.label)}</span>
          <span class="hbar-cell"><span class="hbar" style="width: calc((100% - 6.5em) * ${(r.count / max).toFixed(3)})"></span><span class="hbar-value">${num.format(r.count)} · ${percent(r.count, total)}</span></span>
        </div>`,
    )
    .join('')}</div>`;
}

export type AdminTab = 'live' | 'stats';

export interface ShellInput {
  active: AdminTab;
  lead: string;
  body: string;
  /** Rechargement automatique, en secondes ; aucun s'il est absent. */
  refreshS?: number;
}

const STYLE = `
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
  .tabs, .periods { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0; }
  .tabs a, .periods a { padding: 5px 12px; border: 1px solid var(--line-strong); border-radius: 999px; color: var(--text-2); font-size: 14px; text-decoration: none; }
  .tabs a:hover, .periods a:hover { border-color: var(--miss); color: var(--miss); }
  .tabs a[aria-current], .periods a[aria-current] { background: var(--surface-2); border-color: var(--text-3); color: var(--text); }
  .periods { margin-top: 12px; }
  .periods a { font-size: 13px; padding: 3px 10px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .tile, .card { background: var(--surface-1); border: 1px solid var(--line); border-radius: 14px; }
  .tile { padding: 18px 20px; min-width: 0; }
  .value { color: var(--text); font-size: 40px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .value.word { font-size: clamp(20px, 5.5vw, 30px); line-height: 1.25; }
  .label { color: var(--text-2); font-size: 14px; margin-top: 4px; }
  .detail { color: var(--text-3); font-size: 13px; }
  .card { padding: 20px; margin-bottom: 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 16px; margin-bottom: 16px; }
  .cards.wide { grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); }
  .cards .card { margin-bottom: 0; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; white-space: nowrap; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  th { color: var(--text-3); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
  td.wrap { white-space: normal; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: var(--text-3); }
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
  .hbars { display: grid; gap: 8px; }
  .hbar-row { display: grid; grid-template-columns: minmax(80px, 34%) 1fr; align-items: center; gap: 12px; font-size: 14px; }
  .hbar-label { color: var(--text-2); overflow-wrap: anywhere; }
  .hbar-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .hbar { flex: none; height: 14px; background: var(--miss); border-radius: 0 4px 4px 0; }
  .hbar-row:hover .hbar { background: var(--text); }
  .hbar-value { color: var(--text-2); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
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
`;

const TABS: Array<{ id: AdminTab; href: string; label: string }> = [
  { id: 'live', href: '/admin', label: 'En direct' },
  { id: 'stats', href: '/admin/statistiques', label: 'Statistiques' },
];

/** La page entière : HTML autonome, sans script ni ressource externe. */
export function shell({ active, lead, body, refreshS }: ShellInput): string {
  const tabs = TABS.map(
    (t) => `<a href="${t.href}"${t.id === active ? ' aria-current="page"' : ''}>${t.label}</a>`,
  ).join('');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
${refreshS ? `<meta http-equiv="refresh" content="${refreshS}" />\n` : ''}<title>Navale · administration</title>
<style>${STYLE}</style>
</head>
<body>
  <main>
    <h1>Navale · administration</h1>
    <p class="lead">${lead}</p>
    <nav class="tabs" aria-label="Pages de l’administration">${tabs}</nav>
${body}
    <footer>Navale · données du journal du serveur, sans traceur · <a href="/">Retour au site</a></footer>
  </main>
</body>
</html>`;
}
