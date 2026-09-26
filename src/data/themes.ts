// Visual + audio identity of each realm. The 3D world, the chess board skin
// and the music all read from here so a realm feels the same everywhere.

export type ThemeId = 'hub' | 'meadow' | 'desert' | 'ice' | 'court' | 'throne';
export type ParticleKind = 'motes' | 'fireflies' | 'dust' | 'snow' | 'stars' | 'embers';

export interface Theme {
  id: ThemeId;
  skyTop: number;
  skyBottom: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  groundAlt: number;
  wall: number;
  wallTrim: number;
  accent: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  particles: ParticleKind;
  /** Chess board square colours for battles in this realm. */
  board: { light: string; dark: string; frame: string; glow: string };
  /** Music: MIDI root note, scale degrees (semitones), beats per minute. */
  music: { root: number; scale: number[]; bpm: number; wave: OscillatorType };
}

export const THEMES: Record<ThemeId, Theme> = {
  hub: {
    id: 'hub',
    skyTop: 0x4a74d9, skyBottom: 0xfbe3c2, fog: 0xf3e0cc, fogNear: 70, fogFar: 220,
    ground: 0xe8dfcf, groundAlt: 0xcfc3b0, wall: 0xd8cfc0, wallTrim: 0xc9a14a, accent: 0xf2c14e,
    sun: 0xfff1d6, sunIntensity: 2.4, hemiSky: 0xcfe0ff, hemiGround: 0x8a7a66, hemiIntensity: 1.1,
    particles: 'motes',
    board: { light: '#efe3cf', dark: '#8b6f9e', frame: '#3b3552', glow: '#f2c14e' },
    music: { root: 60, scale: [0, 2, 4, 7, 9], bpm: 84, wave: 'triangle' },
  },
  meadow: {
    id: 'meadow',
    skyTop: 0x4f9be8, skyBottom: 0xd8f0ff, fog: 0xcfe8e0, fogNear: 40, fogFar: 130,
    ground: 0x6fb44f, groundAlt: 0x5a9a3f, wall: 0x2f6b2c, wallTrim: 0x8bcf5c, accent: 0xb4f07a,
    sun: 0xfff4d0, sunIntensity: 2.6, hemiSky: 0xd6ecff, hemiGround: 0x4a7a33, hemiIntensity: 1.1,
    particles: 'fireflies',
    board: { light: '#eaf2c8', dark: '#6a9c4c', frame: '#2f4f25', glow: '#b4f07a' },
    music: { root: 62, scale: [0, 2, 4, 7, 9], bpm: 96, wave: 'triangle' },
  },
  desert: {
    id: 'desert',
    skyTop: 0xe08a3c, skyBottom: 0xffe2a8, fog: 0xf3cf94, fogNear: 35, fogFar: 125,
    ground: 0xe5c07b, groundAlt: 0xd4a95f, wall: 0xc98f4e, wallTrim: 0x7a4b24, accent: 0x3ac2c2,
    sun: 0xffe0a0, sunIntensity: 3.0, hemiSky: 0xffe2b0, hemiGround: 0xa8753c, hemiIntensity: 1.0,
    particles: 'dust',
    board: { light: '#f5deb0', dark: '#c0864a', frame: '#6b3f1d', glow: '#3ac2c2' },
    music: { root: 57, scale: [0, 1, 4, 5, 7, 8, 10], bpm: 88, wave: 'sawtooth' },
  },
  ice: {
    id: 'ice',
    skyTop: 0x7fa6d9, skyBottom: 0xeaf4ff, fog: 0xdfeaf6, fogNear: 30, fogFar: 115,
    ground: 0xeef4fb, groundAlt: 0xcfe0f0, wall: 0x9fb4c9, wallTrim: 0x5d7a99, accent: 0x7fe0ff,
    sun: 0xeaf4ff, sunIntensity: 2.2, hemiSky: 0xe6f2ff, hemiGround: 0x8aa0b8, hemiIntensity: 1.3,
    particles: 'snow',
    board: { light: '#eef6ff', dark: '#7d9cc0', frame: '#34506e', glow: '#7fe0ff' },
    music: { root: 64, scale: [0, 2, 3, 7, 8], bpm: 72, wave: 'sine' },
  },
  court: {
    id: 'court',
    skyTop: 0x120c33, skyBottom: 0x5a3d8f, fog: 0x2d2150, fogNear: 30, fogFar: 120,
    ground: 0x3a2d63, groundAlt: 0x281f4a, wall: 0x6b5aa8, wallTrim: 0xf0d27a, accent: 0xff8fe0,
    sun: 0xd6c8ff, sunIntensity: 1.6, hemiSky: 0x9f8cff, hemiGround: 0x2a1f4a, hemiIntensity: 1.2,
    particles: 'stars',
    board: { light: '#e6dcff', dark: '#6b5aa8', frame: '#1c1438', glow: '#ff8fe0' },
    music: { root: 65, scale: [0, 2, 4, 6, 7, 9, 11], bpm: 80, wave: 'sine' },
  },
  throne: {
    id: 'throne',
    skyTop: 0x0a0508, skyBottom: 0x5a1410, fog: 0x2a0a0a, fogNear: 22, fogFar: 100,
    ground: 0x2a2226, groundAlt: 0x1a1417, wall: 0x3a2f35, wallTrim: 0xff5a2a, accent: 0xff5a2a,
    sun: 0xffb08a, sunIntensity: 1.5, hemiSky: 0xff8a6a, hemiGround: 0x200808, hemiIntensity: 0.8,
    particles: 'embers',
    board: { light: '#d8c8c0', dark: '#5a2a2a', frame: '#120808', glow: '#ff5a2a' },
    music: { root: 55, scale: [0, 1, 3, 5, 6, 8, 10], bpm: 66, wave: 'sawtooth' },
  },
};
