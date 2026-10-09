import type { ResolvedShot } from '@navale/protocol';

/** Un tir résolu, tel que la séquence l'anime. */
export type ShotFxShot = Omit<ResolvedShot, 'sunk'>;

export interface ShotFxHooks {
  /** Au départ du missile : son, compteur de résolution en salve. */
  onLaunch?: (shot: ShotFxShot) => void;
  /** À l'impact : révéler la case sur la grille cible. */
  onImpact: (shot: ShotFxShot) => void;
  /** Afficher / masquer le callout central. */
  onCallout: (shot: ShotFxShot | null) => void;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Séquence d'un tir sur l'écran central, reprise de la maquette (`docs/maquettes/fx.js`) :
 * flash sur la plaque du tireur, missile qui suit une trajectoire courbe en ne
 * laissant sa trace que derrière lui, explosion ou plouf sur la case, puis le
 * callout. Dessin en CSS/SVG (classes de `mockup.css`), positions mesurées dans le DOM.
 * Les tirs d'une salve s'enchaînent dans l'ordre reçu : une file, jamais deux à la fois.
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

  private centerOf(el: Element): [number, number] {
    const screen = this.$('.screen') ?? this.root()!;
    const s = screen.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = s.width / 1920 || 1;
    return [(r.left + r.width / 2 - s.left) / k, (r.top + r.height / 2 - s.top) / k];
  }

  private async run(shot: ShotFxShot, revealDelayMs: number): Promise<void> {
    const root = this.root();
    if (!root || this.disposed) return;
    const { flight, impact, hold } = ShotFx.timings(revealDelayMs);
    const shooterZone = this.$(`.zone[data-player="${shot.shooterId}"]`);
    const targetZone = this.$(`.zone[data-player="${shot.targetId}"]`);
    const plate = shooterZone?.querySelector<HTMLElement>('.nameplate .avatar');
    const cell = targetZone?.querySelector<HTMLElement>(
      `.cell[data-x="${shot.coord.x}"][data-y="${shot.coord.y}"]`,
    );
    const missile = this.$('.missile');
    const trail = this.$('.fx .trail') as SVGPathElement | null;
    const glow = this.$('.fx .trail-glow') as SVGPathElement | null;
    const hot = this.$('.fx .hot') as SVGPathElement | null;
    const boom = this.$('.fx .boom');
    const splash = this.$('.fx .splash');
    this.hooks.onLaunch?.(shot);
    if (!plate || !cell || !missile || !trail || !glow || !hot || !boom || !splash) {
      // Écran pas encore prêt : on révèle et on annonce sans animer.
      this.hooks.onImpact(shot);
      this.hooks.onCallout(shot);
      await sleep(hold);
      this.hooks.onCallout(null);
      return;
    }

    const [x0, y0] = this.centerOf(plate);
    const [x1, y1] = this.centerOf(cell);
    // Point de contrôle vers le centre de l'écran, pour une courbe qui traverse la scène.
    const cx = (x0 + x1) / 2 + (960 - (x0 + x1) / 2) * 0.5;
    const cy = (y0 + y1) / 2 + (540 - (y0 + y1) / 2) * 0.5;
    const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;

    // 1. Départ
    // `launching`, pas `launch` : cette classe-là habille le bloc de lancement du lobby.
    replay(plate.parentElement!, 'launching');
    this.root()
      ?.querySelectorAll('.centre .dimmable')
      .forEach((el) => el.classList.add('dim'));
    await this.fly(d, flight, { missile, trail, glow, hot });
    if (this.disposed) return;

    // 2. Impact
    missile.classList.remove('show');
    hot.classList.remove('on');
    const fx = shot.result === 'MISS' ? splash : boom;
    fx.setAttribute('transform', `translate(${x1.toFixed(1)} ${y1.toFixed(1)})`);
    replay(fx, 'go');
    if (targetZone) {
      targetZone.classList.toggle('wet', shot.result === 'MISS');
      targetZone.classList.add('impact');
      replay(targetZone, 'shake');
    }
    await sleep(Math.round(impact * 0.3));
    this.hooks.onImpact(shot);
    await sleep(Math.round(impact * 0.7));

    // 3. Callout, toujours au centre de l'écran
    this.hooks.onCallout(shot);
    await sleep(300);
    trail.classList.add('fade');
    glow.classList.add('fade');
    await sleep(Math.max(0, hold - 300));
    this.hooks.onCallout(null);
    fx.classList.remove('go');
    await sleep(250);
    targetZone?.classList.remove('impact', 'wet');
    this.root()
      ?.querySelectorAll('.centre .dimmable')
      .forEach((el) => el.classList.remove('dim'));
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
