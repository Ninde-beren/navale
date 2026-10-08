import { create } from 'zustand';

/**
 * Sons de l'écran central et du téléphone, synthétisés avec la Web Audio API :
 * aucun fichier à charger, aucune dépendance, et un son calibré par événement.
 * Les navigateurs bloquent l'audio avant un geste : `installUnlock` écoute le
 * premier geste et réveille le contexte ; `useSfx` expose muet / déverrouillé.
 */
export type SfxName = 'launch' | 'miss' | 'hit' | 'sunk' | 'eliminated' | 'victory' | 'turn';

const KEY = 'navale.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

interface SfxState {
  muted: boolean;
  unlocked: boolean;
  toggle: () => void;
}

export const useSfx = create<SfxState>((set, get) => ({
  muted: readMuted(),
  unlocked: false,
  toggle: () => {
    const muted = !get().muted;
    set({ muted });
    try {
      localStorage.setItem(KEY, muted ? '1' : '0');
    } catch {
      // stockage indisponible : le réglage ne survivra pas au rechargement
    }
    if (!muted) void unlock();
  },
}));

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

export function play(name: SfxName): void {
  const c = context();
  if (!c || !master || useSfx.getState().muted || c.state !== 'running') return;
  SYNTH[name](c, master, c.currentTime);
}

// ---- Synthèse ------------------------------------------------------------------

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
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 700;
    low.connect(out);
    for (const f of [110, 130.81, 164.81])
      tone(c, low, t + 0.05, { type: 'sawtooth', from: f, dur: 1.5, peak: 0.16, attack: 0.25 });
  },
  // Victoire : arpège clair puis accord tenu, avec un scintillement.
  victory: (c, out, t) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) =>
      tone(c, out, t + i * 0.13, { type: 'triangle', from: f, dur: 0.55, peak: 0.2 }),
    );
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 2200;
    low.connect(out);
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
};
