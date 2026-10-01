// The game clock: counts play time from New Game until Morthos falls. It runs
// quietly in the background (no on-screen timer) and can be looked up in the
// pause menu, on the title screen and on the ending screen.
//
// It pauses while the pause menu is open, while on the title screen, and while
// the tab is hidden or the app is closed. Duels and puzzles count — they are
// the game.

import type { Difficulty } from './state.ts';
import { game } from './state.ts';

let running = false;
let paused = false;
let last = 0;

function counting(): boolean {
  return running && !paused && document.visibilityState === 'visible' && !!game.save && game.save.clearedMs === null;
}

/** Adds elapsed time to the save. Called on a timer and before reading the clock. */
export function tickClock() {
  const now = performance.now();
  if (counting() && last) game.s.playMs += now - last;
  last = now;
}

setInterval(tickClock, 1000);
document.addEventListener('visibilitychange', tickClock);

/** Start counting for the current save (or stop, e.g. back at the title screen). */
export function setClockRunning(on: boolean) {
  tickClock();
  running = on;
}

/** Hold the clock while the pause menu is open. */
export function setClockPaused(on: boolean) {
  tickClock();
  paused = on;
}

/** Current play time in ms (final time once the game is beaten). */
export function playTime(): number {
  tickClock();
  const s = game.save;
  if (!s) return 0;
  return s.clearedMs ?? s.playMs;
}

/** 1:02:03, or 12:34 under an hour. */
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Records: every completed run, kept apart from the save so New Game never
// erases them.

export interface RunRecord {
  ms: number;
  difficulty: Difficulty;
  date: number;
  wins: number;
  puzzles: number;
}

const RECORDS_KEY = 'pawns-legend/records/v1';

export function loadRecords(): RunRecord[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? '[]') as RunRecord[];
    return Array.isArray(list) ? list.sort((a, b) => a.ms - b.ms) : [];
  } catch {
    return [];
  }
}

/** Stops the clock for good and files the run. Returns its place among runs on that difficulty (1 = best). */
export function finishRun(): { ms: number; rank: number; ofDifficulty: number } {
  tickClock();
  const s = game.s;
  // A save is only filed the first time it is beaten.
  if (s.clearedMs === null) {
    s.clearedMs = Math.round(s.playMs);
    const list = loadRecords();
    list.push({ ms: s.clearedMs, difficulty: s.difficulty, date: Date.now(), wins: s.stats.wins, puzzles: s.stats.puzzles });
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(list.sort((a, b) => a.ms - b.ms).slice(0, 100)));
    } catch {
      /* storage full or blocked: the run still shows on the ending screen */
    }
    game.persist();
  }
  const ms = s.clearedMs;
  const same = loadRecords().filter((r) => r.difficulty === s.difficulty);
  return { ms, rank: same.findIndex((r) => r.ms === ms) + 1, ofDifficulty: same.length };
}
