import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { COLOR_IDS, type ColorId } from '@navale/protocol';

/**
 * Sons de l'écran central et du téléphone, synthétisés avec la Web Audio API :
 * aucun fichier à charger, aucune dépendance, et un son calibré par événement.
 * Les navigateurs bloquent l'audio avant un geste : `installUnlock` écoute le
 * premier geste et réveille le contexte ; `useSfx` expose muet / déverrouillé.
 */
export type SfxName =
  | 'launch'
  | 'miss'
  | 'hit'
  | 'sunk'
  | 'eliminated'
  | 'victory'
  | 'turn'
  | 'radar'
  | 'sonar'
  | 'hammer'
  | 'shield'
  | 'blocked'
  | 'decoy'
  | 'ghost'
  | 'wisp'
  | 'tide';

/**
 * Rythme des sons de capacité, en secondes : l'écran central cale ses animations
 * dessus. Le rayon du radar fait `turns` tours de `turnSeconds`, un bip à chaque
 * passage au nord ; les ondes du sonar partent sur chaque ping ; le marteau frappe
 * sur chaque coup.
 */
export const RADAR_SWEEP = { turns: 2, turnSeconds: 0.7 } as const;
export const SONAR_PINGS = [0, 0.3, 0.6] as const;
export const HAMMER_TAPS = [0.22, 0.54, 0.86] as const;
/** Tir bloqué : la case de verre se fêle à l'impact et vole en éclats `SHATTER_AT` s après. */
export const SHATTER_AT = 0.3;
/** Les éclats qui tintent en retombant : décalage en s après le bris, et fréquence en Hz. */
const SHARDS = [
  [0, 4200],
  [0.04, 5600],
  [0.09, 3700],
  [0.15, 6300],
  [0.22, 4800],
  [0.3, 5200],
] as const;

interface SfxState {
  muted: boolean;
  unlocked: boolean;
  toggle: () => void;
}

export const useSfx = create<SfxState>()(
  persist(
    (set, get) => ({
      muted: false,
      unlocked: false,
      toggle: () => {
        const muted = !get().muted;
        set({ muted });
        if (!muted) void unlock();
      },
    }),
    // Seul le choix « muet » survit au rechargement : le déverrouillage dépend du navigateur.
    { name: 'navale.muted', partialize: ({ muted }) => ({ muted }) },
  ),
);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    ctx.addEventListener('statechange', () =>
      useSfx.setState({ unlocked: ctx?.state === 'running' }),
    );
  }
  return ctx;
}

/** À appeler sur un geste utilisateur. Sans effet si déjà déverrouillé. */
export async function unlock(): Promise<void> {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      return;
    }
  }
  useSfx.setState({ unlocked: c.state === 'running' });
}

/** Déverrouille l'audio au premier geste sur la page. Renvoie la fonction de retrait. */
export function installUnlock(): () => void {
  const handler = () => void unlock();
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
  };
}

/** Le contexte et sa sortie, si un son peut partir maintenant : déverrouillé, pas en sourdine. */
function audible(): { c: AudioContext; out: GainNode } | null {
  const c = context();
  if (!c || !master || useSfx.getState().muted || c.state !== 'running') return null;
  return { c, out: master };
}

export function play(name: SfxName): void {
  const audio = audible();
  if (audio) SYNTH[name](audio.c, audio.out, audio.c.currentTime);
}

// ---- Synthèse ------------------------------------------------------------------

/** Un passe-bas branché sur `out` : il adoucit les timbres carrés et en dents de scie. */
function lowpass(c: AudioContext, out: AudioNode, frequency: number): BiquadFilterNode {
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = frequency;
  filter.connect(out);
  return filter;
}

type Out = AudioNode;

function envelope(
  c: AudioContext,
  out: Out,
  t: number,
  peak: number,
  attack: number,
  decay: number,
) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function tone(
  c: AudioContext,
  out: Out,
  t: number,
  o: {
    type: OscillatorType;
    from: number;
    to?: number;
    dur: number;
    peak: number;
    attack?: number;
  },
): void {
  const osc = c.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.from, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const attack = o.attack ?? 0.005;
  osc.connect(envelope(c, out, t, o.peak, attack, o.dur));
  osc.start(t);
  osc.stop(t + attack + o.dur + 0.05);
}

function noise(c: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  return src;
}

function burst(
  c: AudioContext,
  out: Out,
  t: number,
  o: {
    filter: BiquadFilterType;
    from: number;
    to: number;
    q?: number;
    dur: number;
    peak: number;
    attack?: number;
  },
): void {
  const src = noise(c, o.dur + 0.1);
  const f = c.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.from, t);
  f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  f.Q.value = o.q ?? 0.8;
  src.connect(f).connect(envelope(c, out, t, o.peak, o.attack ?? 0.01, o.dur));
  src.start(t);
  src.stop(t + o.dur + 0.1);
}

const SYNTH: Record<SfxName, (c: AudioContext, out: Out, t: number) => void> = {
  // Sifflement montant du départ, souffle qui s'ouvre.
  launch: (c, out, t) => {
    burst(c, out, t, { filter: 'bandpass', from: 300, to: 2600, q: 1.2, dur: 0.45, peak: 0.45 });
    tone(c, out, t, { type: 'sine', from: 240, to: 960, dur: 0.4, peak: 0.1 });
  },
  // Plouf : un « bloup » dont la hauteur monte (la signature d'une chute dans l'eau),
  // une gerbe douce à l'attaque lente, puis une petite bulle qui remonte.
  // Ni coup sourd ni souffle descendant : c'est ce qui fait « paf » dans l'explosion.
  miss: (c, out, t) => {
    tone(c, out, t, { type: 'sine', from: 95, to: 460, dur: 0.22, peak: 0.4, attack: 0.012 });
    burst(c, out, t + 0.02, {
      filter: 'bandpass',
      from: 700,
      to: 3200,
      q: 0.7,
      dur: 0.38,
      peak: 0.2,
      attack: 0.05,
    });
    tone(c, out, t + 0.17, { type: 'sine', from: 220, to: 720, dur: 0.14, peak: 0.16 });
  },
  // Explosion : claquement, souffle qui descend, coup sourd.
  hit: (c, out, t) => {
    burst(c, out, t, { filter: 'lowpass', from: 2400, to: 120, dur: 0.7, peak: 0.9 });
    tone(c, out, t, { type: 'sine', from: 120, to: 36, dur: 0.5, peak: 0.8 });
  },
  // Coulé : l'explosion, puis une seconde déflagration et un gémissement de coque.
  sunk: (c, out, t) => {
    SYNTH.hit(c, out, t);
    burst(c, out, t + 0.18, { filter: 'lowpass', from: 1400, to: 80, dur: 1.2, peak: 0.75 });
    tone(c, out, t + 0.2, { type: 'triangle', from: 220, to: 48, dur: 1.0, peak: 0.22 });
    tone(c, out, t + 0.1, { type: 'sine', from: 72, to: 28, dur: 1.3, peak: 0.5 });
  },
  // Élimination : accord mineur sombre qui enfle, sur un coup grave.
  eliminated: (c, out, t) => {
    tone(c, out, t, { type: 'sine', from: 90, to: 30, dur: 0.9, peak: 0.6 });
    const low = lowpass(c, out, 700);
    for (const f of [110, 130.81, 164.81])
      tone(c, low, t + 0.05, { type: 'sawtooth', from: f, dur: 1.5, peak: 0.16, attack: 0.25 });
  },
  // Victoire : arpège clair puis accord tenu, avec un scintillement.
  victory: (c, out, t) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) =>
      tone(c, out, t + i * 0.13, { type: 'triangle', from: f, dur: 0.55, peak: 0.2 }),
    );
    const low = lowpass(c, out, 2200);
    for (const f of [523.25, 659.25, 783.99])
      tone(c, low, t + 0.55, { type: 'square', from: f, dur: 1.6, peak: 0.08, attack: 0.08 });
    burst(c, out, t + 0.5, {
      filter: 'bandpass',
      from: 5000,
      to: 7000,
      q: 2,
      dur: 0.7,
      peak: 0.08,
    });
  },
  // Téléphone : « à toi », deux notes brèves.
  turn: (c, out, t) => {
    tone(c, out, t, { type: 'sine', from: 880, dur: 0.16, peak: 0.3 });
    tone(c, out, t + 0.1, { type: 'sine', from: 1320, dur: 0.22, peak: 0.22 });
  },
  // Radar : un souffle qui balaie à chaque tour du rayon, et un bip électronique bref,
  // carré et adouci, chaque fois qu'il repasse au nord ; le dernier, plus aigu, clôt le balayage.
  radar: (c, out, t) => {
    const { turns, turnSeconds } = RADAR_SWEEP;
    const low = lowpass(c, out, 3800);
    for (let k = 0; k <= turns; k++) {
      const at = t + k * turnSeconds;
      tone(c, low, at, { type: 'square', from: k === turns ? 2350 : 1760, dur: 0.05, peak: 0.1 });
      if (k < turns)
        burst(c, out, at, {
          filter: 'bandpass',
          from: 500,
          to: 2600,
          q: 1.6,
          dur: turnSeconds,
          peak: 0.09,
          attack: turnSeconds * 0.55,
        });
    }
  },
  // Sonar : trois pings graves et longs, chacun suivi de son écho, sur un grondement d'eau.
  sonar: (c, out, t) => {
    for (const at of SONAR_PINGS) {
      tone(c, out, t + at, { type: 'sine', from: 760, to: 690, dur: 0.7, peak: 0.3 });
      tone(c, out, t + at + 0.18, { type: 'sine', from: 760, to: 690, dur: 0.45, peak: 0.08 });
    }
    burst(c, out, t, { filter: 'lowpass', from: 420, to: 160, dur: 1.2, peak: 0.08, attack: 0.3 });
  },
  // Bouclier : une nappe qui monte et scintille, comme un champ de force qui se lève.
  shield: (c, out, t) => {
    tone(c, out, t, { type: 'triangle', from: 220, to: 880, dur: 0.6, peak: 0.16, attack: 0.04 });
    tone(c, out, t + 0.1, { type: 'sine', from: 440, to: 1320, dur: 0.5, peak: 0.08 });
    burst(c, out, t, {
      filter: 'bandpass',
      from: 1500,
      to: 5000,
      q: 2,
      dur: 0.6,
      peak: 0.05,
      attack: 0.2,
    });
  },
  // Tir bloqué : le tir sonne contre le verre, un tintement clair et un coup sourd ; le
  // verre se fêle d'un craquement sec, puis la case vole en éclats qui tintent en retombant.
  blocked: (c, out, t) => {
    burst(c, out, t, { filter: 'highpass', from: 3000, to: 2000, dur: 0.06, peak: 0.4 });
    tone(c, out, t, { type: 'triangle', from: 1200, to: 1150, dur: 0.25, peak: 0.2 });
    tone(c, out, t, { type: 'sine', from: 3100, dur: 0.12, peak: 0.08 });
    tone(c, out, t, { type: 'sine', from: 200, to: 120, dur: 0.1, peak: 0.2 });
    burst(c, out, t + 0.12, { filter: 'highpass', from: 5200, to: 3600, dur: 0.05, peak: 0.25 });
    burst(c, out, t + SHATTER_AT, {
      filter: 'bandpass',
      from: 6500,
      to: 2400,
      q: 1.2,
      dur: 0.45,
      peak: 0.3,
    });
    for (const [at, f] of SHARDS)
      tone(c, out, t + SHATTER_AT + at, {
        type: 'sine',
        from: f,
        to: f * 0.97,
        dur: 0.1,
        peak: 0.07,
      });
  },
  // Leurre : deux petits « bloup » discrets, on ne sait pas où.
  decoy: (c, out, t) => {
    tone(c, out, t, { type: 'sine', from: 330, to: 220, dur: 0.18, peak: 0.2 });
    tone(c, out, t + 0.16, { type: 'sine', from: 440, to: 300, dur: 0.2, peak: 0.16 });
  },
  // Fantôme : un souffle qui gémit en glissant vers l'aigu puis retombe, avant sa carte.
  ghost: (c, out, t) => {
    const low = lowpass(c, out, 1400);
    tone(c, low, t, { type: 'sine', from: 330, to: 520, dur: 0.5, peak: 0.14, attack: 0.25 });
    tone(c, low, t + 0.45, { type: 'sine', from: 520, to: 260, dur: 0.7, peak: 0.12, attack: 0.1 });
    burst(c, out, t, {
      filter: 'bandpass',
      from: 600,
      to: 1800,
      q: 3,
      dur: 1.0,
      peak: 0.05,
      attack: 0.4,
    });
  },
  // Feu follet : un carillon qui s'allume doucement, deux notes claires et un scintillement.
  wisp: (c, out, t) => {
    tone(c, out, t, { type: 'sine', from: 1046.5, to: 1174.7, dur: 0.9, peak: 0.12, attack: 0.18 });
    tone(c, out, t + 0.22, {
      type: 'sine',
      from: 1568,
      to: 1760,
      dur: 0.8,
      peak: 0.08,
      attack: 0.15,
    });
    burst(c, out, t + 0.1, {
      filter: 'bandpass',
      from: 5200,
      to: 7600,
      q: 3,
      dur: 0.9,
      peak: 0.04,
      attack: 0.3,
    });
  },
  // Marée basse : une longue vague grave qui se retire, et le ressac qui suit.
  tide: (c, out, t) => {
    burst(c, out, t, { filter: 'lowpass', from: 900, to: 220, dur: 1.5, peak: 0.22, attack: 0.55 });
    burst(c, out, t + 0.35, {
      filter: 'bandpass',
      from: 1800,
      to: 600,
      q: 0.9,
      dur: 1.0,
      peak: 0.07,
      attack: 0.3,
    });
    tone(c, out, t, { type: 'sine', from: 110, to: 70, dur: 1.4, peak: 0.18, attack: 0.4 });
  },
  // Marteau : trois coups secs sur de la tôle, un claquement, deux harmoniques métalliques et un petit coup sourd.
  hammer: (c, out, t) => {
    for (const at of HAMMER_TAPS) {
      burst(c, out, t + at, { filter: 'highpass', from: 2200, to: 1600, dur: 0.05, peak: 0.5 });
      tone(c, out, t + at, { type: 'triangle', from: 1760, to: 1700, dur: 0.16, peak: 0.16 });
      tone(c, out, t + at, { type: 'sine', from: 2650, to: 2600, dur: 0.1, peak: 0.08 });
      tone(c, out, t + at, { type: 'sine', from: 190, to: 90, dur: 0.08, peak: 0.3 });
    }
  },
};

// ---- Jingle de coulé, un par joueur ------------------------------------------------

/** Huit motifs : une note de départ et un timbre par couleur de joueur. */
const JINGLE_ROOTS = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25];
const JINGLE_WAVES: OscillatorType[] = [
  'triangle',
  'square',
  'sine',
  'triangle',
  'square',
  'sine',
  'triangle',
  'square',
];

/** Petit air de victoire quand ce joueur coule un navire : fondamentale, tierce, quinte, octave. */
export function playSunkJingle(color: ColorId): void {
  const audio = audible();
  if (!audio) return;
  const { c, out } = audio;
  const i = Math.max(0, COLOR_IDS.indexOf(color)) % JINGLE_ROOTS.length;
  const root = JINGLE_ROOTS[i]!;
  const wave = JINGLE_WAVES[i]!;
  const low = lowpass(c, out, 2600);
  const t = c.currentTime;
  [1, 1.25, 1.5, 2].forEach((ratio, n) =>
    tone(c, low, t + n * 0.11, {
      type: wave,
      from: root * ratio,
      dur: n === 3 ? 0.6 : 0.22,
      peak: wave === 'square' ? 0.08 : 0.16,
    }),
  );
  burst(c, out, t + 0.3, {
    filter: 'bandpass',
    from: 5000,
    to: 7500,
    q: 2,
    dur: 0.5,
    peak: 0.05,
  });
}

// ---- Musique de fond -----------------------------------------------------------

/** Quatre accords lents, nappes détunées sous un filtre qui respire, et une vague de souffle par accord. */
const CHORDS = [
  [110, 130.81, 164.81, 220],
  [87.31, 110, 130.81, 174.61],
  [130.81, 164.81, 196, 261.63],
  [98, 123.47, 146.83, 196],
];
const CHORD_SECONDS = 8;

let music: { stop: () => void } | null = null;

export function startMusic(): void {
  const c = context();
  if (!c || !master || music || c.state !== 'running') return;
  const out = master;
  const bus = c.createGain();
  bus.gain.setValueAtTime(0.0001, c.currentTime);
  bus.gain.linearRampToValueAtTime(0.1, c.currentTime + 4);
  const low = lowpass(c, bus, 520);
  low.Q.value = 0.7;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(low.frequency);
  lfo.start();
  bus.connect(out);

  let k = 0;
  let next = c.currentTime + 0.1;
  const scheduleChord = () => {
    const chord = CHORDS[k % CHORDS.length]!;
    const t = next;
    for (const f of chord)
      for (const detune of [-5, 5]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.1, t + 2.5);
        g.gain.setValueAtTime(0.1, t + CHORD_SECONDS - 2);
        g.gain.linearRampToValueAtTime(0.0001, t + CHORD_SECONDS + 0.5);
        o.connect(g).connect(low);
        o.start(t);
        o.stop(t + CHORD_SECONDS + 0.6);
      }
    burst(c, bus, t + 1, {
      filter: 'bandpass',
      from: 300,
      to: 900,
      q: 0.5,
      dur: 5,
      peak: 0.09,
      attack: 2.5,
    });
    k++;
    next += CHORD_SECONDS;
  };
  scheduleChord();
  scheduleChord();
  const timer = setInterval(() => {
    if (next - c.currentTime < CHORD_SECONDS + 1) scheduleChord();
  }, 1000);
  music = {
    stop: () => {
      clearInterval(timer);
      const t = c.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0.0001, t + 1.5);
      setTimeout(() => {
        lfo.stop();
        bus.disconnect();
      }, 1700);
    },
  };
}

export function stopMusic(): void {
  music?.stop();
  music = null;
}

/** Musique tant que `active`, le son n'est pas coupé et le navigateur l'a déverrouillé. */
export function useMusic(active: boolean): void {
  const { muted, unlocked } = useSfx();
  useEffect(() => {
    if (active && !muted && unlocked) startMusic();
    else stopMusic();
  }, [active, muted, unlocked]);
  useEffect(() => () => stopMusic(), []);
}
