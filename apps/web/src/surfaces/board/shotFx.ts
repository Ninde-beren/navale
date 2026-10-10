import type { Coord, ResolvedShot } from '@navale/protocol';
import { HAMMER_TAPS, SHATTER_AT, SONAR_PINGS } from '../../shared/audio.js';
import { RADAR_SWEEP_MS } from '../../shared/radarSweep.js';

/** Un tir résolu, tel que la séquence l'anime. */
export type ShotFxShot = Omit<ResolvedShot, 'sunk'>;

/** Un radar en train de balayer la grille d'un joueur : centre et taille de sa zone. */
export interface Sweep {
  playerId: string;
  center: Coord;
  size: number;
}

export interface ShotFxHooks {
  /** Au départ du missile : son, compteur de résolution en salve. */
  onLaunch?: (shot: ShotFxShot) => void;
  /** À l'impact : révéler la case sur la grille cible. */
  onImpact: (shot: ShotFxShot) => void;
  /** Afficher / masquer le callout central. */
  onCallout: (shot: ShotFxShot | null) => void;
  /** Poser / retirer le balayage d'un radar, que la grille dessine (`RadarSweep`). */
  onSweep?: (sweep: Sweep | null) => void;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Les éléments d'un missile en vol : le projectile, sa traînée, l'explosion et le plouf. */
interface Missile {
  missile: HTMLElement;
  trail: SVGPathElement;
  glow: SVGPathElement;
  hot: SVGPathElement;
  boom: Element;
  splash: Element;
}

/** Ce qu'il faut mesurer pour un tir : les zones, la plaque du tireur, la case et la trajectoire. */
interface Path {
  targetZone: HTMLElement | null;
  plate: HTMLElement;
  cell: HTMLElement;
  d: string;
  x1: number;
  y1: number;
}

/** Les classes d'état qu'une copie du calque ne doit pas hériter de l'original. */
const STATES = ['show', 'draw', 'fade', 'on', 'go'];

/** Durée d'une onde de sonar, en ms ; la dernière part au dernier ping (`SONAR_PINGS`). */
const SONAR_WAVE_MS = 1000;
/** Un coup de marteau, en ms : il frappe à 70 % du mouvement, sur chaque coup de `HAMMER_TAPS`. */
const HAMMER_SWING_MS = 320;
/** Le feu follet d'un fantôme, en ms : il descend sur la case et s'y allume. */
export const WISP_MS = 1400;
/** La marée basse, en ms : la mer se retire sur la grille d'un survivant. */
export const TIDE_MS = 1600;
/** Un tir arrêté par un bouclier, en ms : l'éclair, la fêlure, puis le bris (`SHATTER_AT`). */
const BLOCK_MS = 1100;
/** La fêlure du verre, tracée depuis le point d'impact. */
const CRACK_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1"
d="M20 20 3 7M20 20 31 2M20 20 38 23M20 20 26 38M20 20 5 31M11 13 6 21M28 10 35 15M30 22 32 31"/></svg>`;
/** Les éclats : direction (en cases) et rotation de chacun quand la case vole en éclats. */
const SHARDS = [
  [-0.9, -0.8, -140],
  [0.8, -1, 120],
  [1.1, 0.3, 200],
  [0.5, 1.1, -90],
  [-0.7, 0.9, 160],
  [-1.2, 0, -220],
] as const;

/** Un petit marteau : tête d'acier, manche de bois, tourné pour frapper vers le bas à gauche. */
const HAMMER_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-45 24 24)">
<rect x="22" y="14" width="4.5" height="30" rx="2" fill="#c98a4b" stroke="#7a4d22" stroke-width="1.2"/>
<rect x="11" y="5" width="26" height="11" rx="2.5" fill="#d7dde6" stroke="#5c6675" stroke-width="1.4"/>
<rect x="11" y="5" width="26" height="3.5" rx="1.5" fill="#ffffff" opacity="0.55"/></g></svg>`;

/**
 * Séquence d'un tir sur l'écran central, reprise des maquettes de conception :
 * flash sur la plaque du tireur, missile qui suit une trajectoire courbe en ne
 * laissant sa trace que derrière lui, explosion ou plouf sur la case, puis le
 * callout. Dessin en CSS/SVG (classes de `mockup.css`), positions mesurées dans le DOM.
 * Les tirs d'une salve s'enchaînent dans l'ordre reçu : une file, jamais deux à la fois.
 * Seule exception, la rafale d'un missile : ses tirs volent ensemble (`playBurst`).
 */
export class ShotFx {
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly root: () => HTMLElement | null,
    private readonly hooks: ShotFxHooks,
  ) {}

  /** Durées dérivées de `revealDelayMs` : la séquence tient dans la cadence du serveur. */
  static timings(revealDelayMs: number) {
    const T = Math.max(1200, revealDelayMs);
    return {
      flight: Math.round(T * 0.4),
      impact: Math.round(T * 0.18),
      hold: Math.round(T * 0.42) - 150,
    };
  }

  play(shot: ShotFxShot, revealDelayMs: number): Promise<void> {
    return this.enqueue(() => this.run(shot, revealDelayMs));
  }

  /**
   * Une rafale : les missiles partent l'un après l'autre à `staggerMs` d'écart, volent
   * ensemble, puis les impacts s'enchaînent dans le même ordre. Chaque missile a ses
   * propres éléments, copiés du calque et retirés après coup. Pas d'annonce ici :
   * l'appelant annonce le verdict de la rafale, puis appelle `finish`.
   */
  playBurst(shots: ShotFxShot[], revealDelayMs: number, staggerMs: number): Promise<void> {
    return this.enqueue(async () => {
      this.dim(true);
      await Promise.all(
        shots.map(async (shot, i) => {
          await sleep(i * staggerMs);
          if (!this.disposed) await this.runCopy(shot, revealDelayMs);
        }),
      );
    });
  }

  /** Fin d'une rafale : le centre se rallume. */
  finish(): void {
    this.dim(false);
  }

  /**
   * Une capacité qui ne tire pas, jouée sur une case : le balayage du radar ou les ondes du
   * sonar sur la grille de la cible, couvrant les `span` × `span` cases de sa zone, ou le
   * marteau qui tape sur la case réparée. Le bouclier se lève en secret : rien ici.
   * L'animation est la même quelle que soit la case : elle ne révèle rien. Pour un fantôme,
   * le feu follet qui s'allume sur une case, et la marée qui se retire sur toute une grille.
   * Rend la main quand elle est finie ; le son se joue à côté, au même instant.
   */
  async mark(
    kind: 'radar' | 'sonar' | 'repair' | 'wisp' | 'tide',
    actorId: string,
    zonePlayerId: string,
    coord: Coord,
    span = 1,
  ): Promise<void> {
    const plate = this.$(`.zone[data-player="${actorId}"] .nameplate .avatar`);
    if (plate) replay(plate.parentElement!, 'launching');
    if (kind === 'radar') {
      // Le balayage est dessiné par la grille elle-même, en React : on le pose, puis on le retire.
      this.hooks.onSweep?.({ playerId: zonePlayerId, center: coord, size: span });
      await sleep(RADAR_SWEEP_MS);
      this.hooks.onSweep?.(null);
      return;
    }
    if (kind === 'tide') {
      const grid = this.$(`.zone[data-player="${zonePlayerId}"] .grid`);
      const wave = document.createElement('span');
      wave.className = 'fx-tide';
      wave.setAttribute('aria-hidden', 'true');
      grid?.appendChild(wave);
      await sleep(TIDE_MS);
      wave.remove();
      return;
    }
    const duration =
      kind === 'sonar'
        ? SONAR_PINGS[SONAR_PINGS.length - 1]! * 1000 + SONAR_WAVE_MS
        : kind === 'wisp'
          ? WISP_MS
          : HAMMER_TAPS.length * HAMMER_SWING_MS + 40;
    const cell = this.$(
      `.zone[data-player="${zonePlayerId}"] .cell[data-x="${coord.x}"][data-y="${coord.y}"]`,
    );
    if (!cell || this.disposed) {
      await sleep(duration);
      return;
    }
    const el = document.createElement('span');
    el.className = `fx-${kind}`;
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--span', String(span));
    if (kind === 'sonar') {
      for (const at of SONAR_PINGS) {
        const wave = document.createElement('i');
        wave.style.animationDelay = `${Math.round(at * 1000)}ms`;
        el.appendChild(wave);
      }
    } else if (kind === 'repair') {
      el.innerHTML = `${HAMMER_SVG}<b></b>`;
    }
    cell.appendChild(el);
    await sleep(duration);
    el.remove();
  }

  /** Place une annonce (élimination…) dans la file, après les tirs déjà en attente. */
  enqueue(step: () => Promise<void>): Promise<void> {
    const run = this.queue.then(() => (this.disposed ? undefined : step()));
    this.queue = run.catch(() => undefined);
    return run;
  }

  dispose(): void {
    this.disposed = true;
  }

  private $(sel: string): HTMLElement | null {
    return this.root()?.querySelector<HTMLElement>(sel) ?? null;
  }

  private dim(on: boolean): void {
    this.root()
      ?.querySelectorAll('.centre .dimmable')
      .forEach((el) => el.classList.toggle('dim', on));
  }

  private centerOf(el: Element): [number, number] {
    const screen = this.$('.screen') ?? this.root()!;
    const s = screen.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = s.width / 1920 || 1;
    return [(r.left + r.width / 2 - s.left) / k, (r.top + r.height / 2 - s.top) / k];
  }

  /** Le calque d'effets de l'écran ; `null` tant qu'il n'est pas monté. */
  private layer(): Missile | null {
    const missile = this.$('.missile');
    const trail = this.$('.fx .trail') as SVGPathElement | null;
    const glow = this.$('.fx .trail-glow') as SVGPathElement | null;
    const hot = this.$('.fx .hot') as SVGPathElement | null;
    const boom = this.$('.fx .boom');
    const splash = this.$('.fx .splash');
    if (!missile || !trail || !glow || !hot || !boom || !splash) return null;
    return { missile, trail, glow, hot, boom, splash };
  }

  /** La trajectoire d'un tir, de la plaque du tireur à la case visée ; `null` si l'écran n'est pas prêt. */
  private path(shot: ShotFxShot): Path | null {
    const shooterZone = this.$(`.zone[data-player="${shot.shooterId}"]`);
    const targetZone = this.$(`.zone[data-player="${shot.targetId}"]`);
    const plate = shooterZone?.querySelector<HTMLElement>('.nameplate .avatar');
    const cell = targetZone?.querySelector<HTMLElement>(
      `.cell[data-x="${shot.coord.x}"][data-y="${shot.coord.y}"]`,
    );
    if (!plate || !cell) return null;
    const [x0, y0] = this.centerOf(plate);
    const [x1, y1] = this.centerOf(cell);
    // Point de contrôle vers le centre de l'écran, pour une courbe qui traverse la scène.
    const cx = (x0 + x1) / 2 + (960 - (x0 + x1) / 2) * 0.5;
    const cy = (y0 + y1) / 2 + (540 - (y0 + y1) / 2) * 0.5;
    const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    return { targetZone, plate, cell, d, x1, y1 };
  }

  /** Départ, vol et impact d'un missile ; rend la main juste après l'impact, l'effet encore visible. */
  private async launch(
    shot: ShotFxShot,
    path: Path,
    els: Missile,
    flight: number,
    impact: number,
  ): Promise<Element> {
    // `launching`, pas `launch` : cette classe-là habille le bloc de lancement du lobby.
    replay(path.plate.parentElement!, 'launching');
    await this.fly(path.d, flight, els);
    if (this.disposed) return els.boom;
    els.missile.classList.remove('show');
    els.hot.classList.remove('on');
    const fx = shot.result === 'MISS' ? els.splash : els.boom;
    if (shot.result === 'BLOCKED') {
      // Arrêté net par le bouclier : un éclair, le verre de la case se fêle puis vole en
      // éclats ; ni explosion ni plouf, la même chose sur l'eau que sur un navire.
      const flash = document.createElement('span');
      flash.className = 'fx-block';
      flash.setAttribute('aria-hidden', 'true');
      const glass = document.createElement('span');
      glass.className = 'fx-shatter';
      glass.setAttribute('aria-hidden', 'true');
      glass.style.setProperty('--shatter-at', `${Math.round(SHATTER_AT * 1000)}ms`);
      glass.innerHTML = CRACK_SVG;
      for (const [dx, dy, r] of SHARDS) {
        const shard = document.createElement('i');
        shard.style.setProperty('--dx', String(dx));
        shard.style.setProperty('--dy', String(dy));
        shard.style.setProperty('--r', `${r}deg`);
        glass.appendChild(shard);
      }
      path.cell.append(flash, glass);
      setTimeout(() => {
        flash.remove();
        glass.remove();
      }, BLOCK_MS);
    } else {
      fx.setAttribute('transform', `translate(${path.x1.toFixed(1)} ${path.y1.toFixed(1)})`);
      replay(fx, 'go');
    }
    const zone = path.targetZone;
    if (zone) {
      zone.classList.toggle('wet', shot.result === 'MISS');
      zone.classList.add('impact');
      replay(zone, 'shake');
    }
    await sleep(Math.round(impact * 0.3));
    this.hooks.onImpact(shot);
    await sleep(Math.round(impact * 0.7));
    return fx;
  }

  private async run(shot: ShotFxShot, revealDelayMs: number): Promise<void> {
    if (!this.root() || this.disposed) return;
    const { flight, impact, hold } = ShotFx.timings(revealDelayMs);
    const els = this.layer();
    const path = this.path(shot);
    this.hooks.onLaunch?.(shot);
    if (!els || !path) {
      // Écran pas encore prêt : on révèle et on annonce sans animer.
      this.hooks.onImpact(shot);
      this.hooks.onCallout(shot);
      await sleep(hold);
      this.hooks.onCallout(null);
      return;
    }
    this.dim(true);
    const fx = await this.launch(shot, path, els, flight, impact);
    if (this.disposed) return;
    // Callout, toujours au centre de l'écran
    this.hooks.onCallout(shot);
    await sleep(300);
    els.trail.classList.add('fade');
    els.glow.classList.add('fade');
    await sleep(Math.max(0, hold - 300));
    this.hooks.onCallout(null);
    fx.classList.remove('go');
    await sleep(250);
    path.targetZone?.classList.remove('impact', 'wet');
    this.dim(false);
  }

  /** Un missile de rafale, sur une copie du calque : plusieurs peuvent voler en même temps. */
  private async runCopy(shot: ShotFxShot, revealDelayMs: number): Promise<void> {
    const { flight, impact } = ShotFx.timings(revealDelayMs);
    const layer = this.layer();
    const path = this.path(shot);
    this.hooks.onLaunch?.(shot);
    if (!layer || !path) {
      this.hooks.onImpact(shot);
      return;
    }
    const copy = <T extends Element>(el: T): T => {
      const c = el.cloneNode(true) as T;
      c.classList.remove(...STATES);
      el.parentNode?.insertBefore(c, el);
      return c;
    };
    const els: Missile = {
      missile: copy(layer.missile),
      trail: copy(layer.trail),
      glow: copy(layer.glow),
      hot: copy(layer.hot),
      boom: copy(layer.boom),
      splash: copy(layer.splash),
    };
    await this.launch(shot, path, els, flight, impact);
    els.trail.classList.add('fade');
    els.glow.classList.add('fade');
    path.targetZone?.classList.remove('impact', 'wet');
    // L'explosion et le plouf finissent de s'animer, puis la copie disparaît.
    setTimeout(() => Object.values(els).forEach((el) => el.remove()), 1400);
  }

  private fly(
    d: string,
    duration: number,
    els: { missile: HTMLElement; trail: SVGPathElement; glow: SVGPathElement; hot: SVGPathElement },
  ): Promise<void> {
    const { missile, trail, glow, hot } = els;
    return new Promise((resolve) => {
      for (const el of [trail, glow, hot]) el.setAttribute('d', d);
      const L = trail.getTotalLength();
      const TAIL = 170;
      for (const el of [trail, glow]) {
        el.style.strokeDasharray = `${L} ${L}`;
        el.style.strokeDashoffset = `${L}`;
      }
      hot.style.strokeDasharray = `${TAIL} ${L}`;
      hot.style.strokeDashoffset = `${TAIL}`;
      missile.style.offsetPath = `path("${d}")`;
      missile.style.offsetDistance = '0%';
      trail.classList.remove('fade');
      glow.classList.remove('fade');
      void missile.offsetWidth;
      missile.classList.add('show');
      trail.classList.add('draw');
      glow.classList.add('draw');
      hot.classList.add('on');
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = -(Math.cos(Math.PI * t) - 1) / 2;
        const pos = e * L;
        missile.style.offsetDistance = `${e * 100}%`;
        trail.style.strokeDashoffset = `${L - pos}`;
        glow.style.strokeDashoffset = `${L - pos}`;
        hot.style.strokeDashoffset = `${TAIL - pos}`;
        if (t < 1 && !this.disposed) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
}

function replay(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).getBoundingClientRect();
  el.classList.add(cls);
}
