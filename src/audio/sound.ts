// All sound is synthesised with Web Audio: no audio files to download, and
// each realm gets its own little looping tune from its theme's scale.

import type { Theme } from '../data/themes.ts';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxOn = true;
let musicOn = true;

function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.22 : 0;
    musicBus.connect(master);
  }
  return ctx;
}

/** Browsers only allow audio after a tap/click; call this from input handlers. */
export function unlockAudio() {
  const a = audio();
  if (a?.state === 'suspended') void a.resume();
}

export function setSound(opts: { sfx: boolean; music: boolean }) {
  sfxOn = opts.sfx;
  musicOn = opts.music;
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicOn ? 0.22 : 0, ctx.currentTime, 0.2);
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number; delay?: number; bus?: AudioNode } = {}) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t + dur);
  const vol = opts.vol ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(opts.bus ?? master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, vol = 0.15, delay = 0) {
  const a = audio();
  if (!a || !master) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(a.currentTime + delay);
}

export type Sfx =
  | 'move' | 'capture' | 'check' | 'select' | 'confirm' | 'back'
  | 'chest' | 'door' | 'portal' | 'jump' | 'win' | 'lose' | 'reward' | 'talk' | 'locked';

export function sfx(name: Sfx) {
  if (!sfxOn) return;
  switch (name) {
    case 'move': noise(0.06, 0.25); tone(220, 0.08, { type: 'sine', vol: 0.12 }); break;
    case 'capture': noise(0.12, 0.35); tone(160, 0.14, { type: 'square', vol: 0.08, slide: 0.6 }); break;
    case 'check': tone(880, 0.12, { type: 'square', vol: 0.08 }); tone(660, 0.18, { type: 'square', vol: 0.08, delay: 0.1 }); break;
    case 'select': tone(740, 0.06, { vol: 0.1 }); break;
    case 'confirm': tone(660, 0.08, { vol: 0.12 }); tone(990, 0.12, { vol: 0.12, delay: 0.07 }); break;
    case 'back': tone(520, 0.08, { vol: 0.1, slide: 0.7 }); break;
    case 'talk': tone(420 + Math.random() * 120, 0.04, { type: 'square', vol: 0.04 }); break;
    case 'locked': tone(140, 0.18, { type: 'square', vol: 0.1 }); tone(120, 0.2, { type: 'square', vol: 0.1, delay: 0.12 }); break;
    case 'jump': tone(300, 0.18, { type: 'sine', vol: 0.12, slide: 2.2 }); break;
    case 'door': noise(0.6, 0.2); tone(90, 0.7, { type: 'sawtooth', vol: 0.06, slide: 0.7 }); break;
    case 'portal': tone(300, 0.6, { type: 'sine', vol: 0.12, slide: 3 }); tone(450, 0.6, { type: 'sine', vol: 0.08, slide: 3, delay: 0.08 }); break;
    case 'chest':
    case 'reward': {
      // The classic "you found something" rising arpeggio.
      const notes = name === 'chest' ? [67, 71, 74, 79] : [72, 76, 79, 84];
      notes.forEach((n, i) => tone(midi(n), 0.35, { vol: 0.14, delay: i * 0.11 }));
      tone(midi(notes[3] + 12), 0.8, { type: 'sine', vol: 0.1, delay: 0.46 });
      break;
    }
    case 'win': [60, 64, 67, 72, 67, 72, 76].forEach((n, i) => tone(midi(n), 0.3, { vol: 0.14, delay: i * 0.12 })); break;
    case 'lose': [67, 63, 60, 55].forEach((n, i) => tone(midi(n), 0.4, { type: 'sine', vol: 0.14, delay: i * 0.2 })); break;
  }
}

// ---------------------------------------------------------------------------
// Music: a soft generative loop — a bass drone, a pad, and a wandering melody
// in the realm's scale. Deterministic per realm so each place has its tune.

let musicTimer: number | null = null;
let currentTheme: string | null = null;

export function playMusic(theme: Theme, intensity: 'explore' | 'battle' = 'explore') {
  const key = theme.id + intensity;
  if (currentTheme === key) return;
  stopMusic();
  currentTheme = key;
  const a = audio();
  if (!a || !musicBus) return;
  const { root, scale, wave } = theme.music;
  const bpm = theme.music.bpm * (intensity === 'battle' ? 1.25 : 1);
  const beat = 60 / bpm;
  let seed = [...theme.id].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const phrase: number[] = [];
  let deg = 0;
  for (let i = 0; i < 16; i++) {
    deg = Math.max(-2, Math.min(scale.length + 2, deg + Math.floor(rand() * 5) - 2));
    phrase.push(rand() < 0.22 ? -99 : deg);
  }
  const noteOf = (d: number) => root + 12 * Math.floor(d / scale.length) + scale[((d % scale.length) + scale.length) % scale.length];
  let step = 0;
  const tick = () => {
    if (!musicOn) return;
    const bar = Math.floor(step / 8);
    if (step % 8 === 0) {
      const chordRoot = [0, 3, 4, 2][bar % 4];
      tone(midi(noteOf(chordRoot) - 24), beat * 8, { type: 'sine', vol: 0.5, bus: musicBus! });
      tone(midi(noteOf(chordRoot + 2) - 12), beat * 8, { type: wave === 'sawtooth' ? 'triangle' : 'sine', vol: 0.12, bus: musicBus! });
    }
    const d = phrase[step % 16];
    if (d !== -99 && (intensity === 'battle' || step % 2 === 0)) {
      tone(midi(noteOf(d)), beat * 1.6, { type: wave, vol: wave === 'sawtooth' ? 0.06 : 0.16, bus: musicBus! });
    }
    step++;
  };
  tick();
  musicTimer = window.setInterval(tick, beat * 1000);
}

export function stopMusic() {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
  currentTheme = null;
}
