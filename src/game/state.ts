// Save data: everything that persists between sessions lives here and in
// localStorage. Keep it plain JSON so it survives future versions.

import type { Arrangement } from './army.ts';
import { STARTING_WALLET, type Wallet } from './pieces.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface SaveData {
  version: 1;
  difficulty: Difficulty;
  wallet: Wallet;
  /** Enemy ids that have been checkmated. */
  defeated: string[];
  /** Chest ids already opened. */
  opened: string[];
  /** Puzzle-lock ids already solved. */
  solved: string[];
  /** Realms the hero has set foot in (for the map / fast travel later). */
  visited: string[];
  realm: string;
  pos: { x: number; z: number } | null;
  arrangement?: Arrangement;
  stats: { wins: number; losses: number; draws: number; puzzles: number };
  /** Play time in ms since New Game (see game/timer.ts). */
  playMs: number;
  /** Final play time once Morthos is beaten; the clock stops there. */
  clearedMs: number | null;
  settings: { music: boolean; sfx: boolean };
  createdAt: number;
}

const KEY = 'pawns-legend/save/v1';

export function newSave(difficulty: Difficulty): SaveData {
  return {
    version: 1,
    difficulty,
    wallet: { ...STARTING_WALLET },
    defeated: [],
    opened: [],
    solved: [],
    visited: ['hub'],
    realm: 'hub',
    pos: null,
    stats: { wins: 0, losses: 0, draws: 0, puzzles: 0 },
    playMs: 0,
    clearedMs: null,
    settings: { music: true, sfx: true },
    createdAt: Date.now(),
  };
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data?.version !== 1 || !data.wallet) return null;
    // Fill in fields added after the first release.
    const fresh = newSave(data.difficulty ?? 'medium');
    return { ...fresh, ...data, settings: { ...fresh.settings, ...data.settings }, stats: { ...fresh.stats, ...data.stats } };
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or storage full: the game keeps running, just without saving.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The single live save, shared by every module. */
export const game = {
  save: null as SaveData | null,
  get s(): SaveData {
    if (!this.save) throw new Error('No game in progress');
    return this.save;
  },
  persist(): void {
    if (this.save) writeSave(this.save);
  },
};
