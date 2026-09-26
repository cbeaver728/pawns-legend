// The "chess mind" every enemy plays with.
//
// Primary: Stockfish 19 (lite, single-threaded WASM, from github.com/nmrugg/stockfish.js)
// running in a Web Worker, served from /engine. Single-threaded because GitHub
// Pages cannot send the COOP/COEP headers that threads require.
//
// If the engine cannot load (very old browser, blocked download), a small
// built-in alpha-beta search takes over so the game always stays playable.
//
// Difficulty only changes how well the mind plays — never the pieces. Bosses
// get harder by bringing more pieces, not by thinking harder.

import { Chess } from 'chess.js';
import type { Difficulty } from '../game/state.ts';
import { fallbackMove } from './fallbackAI.ts';

export interface MindProfile {
  label: string;
  blurb: string;
  skill: number;       // Stockfish "Skill Level" 0..20
  depth?: number;
  movetime: number;    // ms cap per move
  /** Chance of playing a random legal move instead (makes Easy feel human). */
  blunder: number;
}

export const MINDS: Record<Difficulty, MindProfile> = {
  easy: {
    label: 'Easy Mind', blurb: 'A friendly opponent that often misses tactics. Great for learning.',
    skill: 0, depth: 1, movetime: 250, blunder: 0.22,
  },
  medium: {
    label: 'Medium Mind', blurb: 'A solid club player. Punishes loose pieces.',
    skill: 6, depth: 6, movetime: 700, blunder: 0,
  },
  hard: {
    label: 'Hard Mind', blurb: 'Full-strength Stockfish thinking. Every piece you collect matters.',
    skill: 20, movetime: 1500, blunder: 0,
  },
};

type Status = 'idle' | 'loading' | 'ready' | 'failed';

class ChessMind {
  private worker: Worker | null = null;
  private status: Status = 'idle';
  private readyPromise: Promise<boolean> | null = null;
  private listeners = new Set<(line: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();

  get engineName(): string {
    return this.status === 'ready' ? 'Stockfish 19' : this.status === 'failed' ? 'Built-in mind' : 'Waking…';
  }

  /** Starts loading the engine in the background. Safe to call many times. */
  warmUp(): Promise<boolean> {
    if (this.readyPromise) return this.readyPromise;
    this.status = 'loading';
    this.readyPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        this.status = ok ? 'ready' : 'failed';
        if (!ok) {
          this.worker?.terminate();
          this.worker = null;
        }
        resolve(ok);
      };
      try {
        const url = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;
        this.worker = new Worker(url);
        this.worker.onmessage = (e: MessageEvent) => {
          const line = String(e.data);
          for (const l of this.listeners) l(line);
        };
        this.worker.onerror = () => done(false);
        const onLine = (line: string) => {
          if (line === 'uciok') this.send('isready');
          if (line === 'readyok') {
            this.listeners.delete(onLine);
            done(true);
          }
        };
        this.listeners.add(onLine);
        this.send('uci');
      } catch {
        done(false);
      }
      setTimeout(() => done(false), 20000);
    });
    return this.readyPromise;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private waitFor(prefix: string, timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.listeners.delete(on);
        resolve(null);
      }, timeoutMs);
      const on = (line: string) => {
        if (line.startsWith(prefix)) {
          clearTimeout(timer);
          this.listeners.delete(on);
          resolve(line);
        }
      };
      this.listeners.add(on);
    });
  }

  /** Clears the engine's memory between games. */
  newGame() {
    if (this.status === 'ready') this.send('ucinewgame');
  }

  /**
   * Best move for the side to move, in UCI notation (e.g. "e7e5", "a2a1q").
   * Never rejects: falls back to the built-in mind on any engine trouble.
   */
  bestMove(fen: string, difficulty: Difficulty): Promise<string | null> {
    const run = async () => {
      const mind = MINDS[difficulty];
      const game = new Chess(fen);
      const legal = game.moves({ verbose: true });
      if (legal.length === 0) return null;

      const started = performance.now();
      let uci: string | null = null;

      if (Math.random() < mind.blunder) {
        const m = legal[Math.floor(Math.random() * legal.length)];
        uci = m.from + m.to + (m.promotion ?? '');
      } else if (await this.warmUp()) {
        this.send(`setoption name Skill Level value ${mind.skill}`);
        this.send(`position fen ${fen}`);
        this.send(mind.depth ? `go depth ${mind.depth} movetime ${mind.movetime}` : `go movetime ${mind.movetime}`);
        const line = await this.waitFor('bestmove', mind.movetime + 8000);
        const move = line?.split(/\s+/)[1];
        if (move && move !== '(none)') uci = move;
        else if (!line) this.send('stop');
      }
      if (!uci || !legal.some((m) => m.from + m.to + (m.promotion ?? '') === uci)) {
        uci = fallbackMove(fen, difficulty);
      }

      // Always "think" for a moment so moves never snap back instantly.
      const minThink = 450 + Math.random() * 350;
      const elapsed = performance.now() - started;
      if (elapsed < minThink) await new Promise((r) => setTimeout(r, minThink - elapsed));
      return uci;
    };
    // Serialise requests: the engine can only think about one position at a time.
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

export const chessMind = new ChessMind();
