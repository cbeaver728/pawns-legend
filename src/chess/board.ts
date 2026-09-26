// A playable chess board: chess.js holds the rules, chessground draws the
// board and handles taps and drags (it is the board lichess uses, so it is
// solid on phones).

import { Chess, type Move, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import type { Theme } from '../data/themes.ts';
import { pieceIcon } from '../ui/icons.ts';
import { el } from '../ui/dom.ts';

type Promo = 'q' | 'r' | 'b' | 'n';

export class ChessBoard {
  readonly root: HTMLElement;
  readonly game: Chess;
  private cg: Api;
  private wrap: HTMLElement;
  private waiting: ((m: Move) => void) | null = null;

  constructor(fen: string, theme: Theme) {
    this.game = new Chess(fen);
    this.root = el('div', { class: 'board-frame' });
    this.root.style.setProperty('--sq-light', theme.board.light);
    this.root.style.setProperty('--sq-dark', theme.board.dark);
    this.root.style.setProperty('--board-frame', theme.board.frame);
    this.root.style.setProperty('--board-glow', theme.board.glow);
    this.wrap = el('div', { class: 'board' });
    this.root.append(this.wrap);
    this.cg = Chessground(this.wrap, {
      fen: this.game.fen(),
      orientation: 'white',
      turnColor: 'white',
      coordinates: true,
      animation: { enabled: true, duration: 220 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, color: undefined, showDests: true, events: { after: (o, d) => this.onUserMove(o, d) } },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true },
      drawable: { enabled: false },
    });
  }

  get fen(): string {
    return this.game.fen();
  }

  private dests(): Map<Key, Key[]> {
    const d = new Map<Key, Key[]>();
    for (const m of this.game.moves({ verbose: true })) {
      const list = d.get(m.from) ?? [];
      list.push(m.to);
      d.set(m.from, list);
    }
    return d;
  }

  /** Redraws the board from the rules engine. */
  private sync(lastMove?: [Key, Key], interactive = false) {
    const color = this.game.turn() === 'w' ? 'white' : 'black';
    this.cg.set({
      fen: this.game.fen(),
      turnColor: color,
      check: this.game.inCheck() ? color : false,
      lastMove,
      movable: { color: interactive ? 'white' : undefined, dests: interactive ? this.dests() : new Map() },
    });
  }

  /** Lets the hero (white) move, resolving with the move they chose. */
  awaitUserMove(): Promise<Move> {
    this.sync(undefined, true);
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  lock() {
    this.waiting = null;
    this.cg.set({ movable: { color: undefined, dests: new Map() } });
  }

  private async onUserMove(from: Key, to: Key) {
    const resolve = this.waiting;
    if (!resolve) return;
    const piece = this.game.get(from as Square);
    let promotion: Promo | undefined;
    if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) {
      promotion = await this.pickPromotion(piece.color === 'w' ? 'white' : 'black');
    }
    let move: Move;
    try {
      move = this.game.move({ from, to, promotion });
    } catch {
      this.sync(undefined, true); // illegal: snap back
      return;
    }
    this.waiting = null;
    if (promotion) this.cg.set({ fen: this.game.fen() });
    this.sync([from, to]);
    resolve(move);
  }

  /** Plays a move given in UCI notation (e.g. "e7e8q"). */
  playUci(uci: string): Move | null {
    try {
      const move = this.game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as Promo | undefined });
      this.cg.move(move.from, move.to);
      this.sync([move.from, move.to]);
      return move;
    } catch {
      return null;
    }
  }

  /** Resets to a position (used by puzzles after a wrong try). */
  reset(fen: string) {
    this.game.load(fen);
    this.sync();
  }

  private pickPromotion(color: 'white' | 'black'): Promise<Promo> {
    return new Promise((resolve) => {
      const picker = el('div', { class: 'promo' }, el('div', { class: 'promo-title' }, 'Promote to'));
      const row = el('div', { class: 'promo-row' });
      for (const k of ['q', 'r', 'b', 'n'] as Promo[]) {
        const btn = el('button', { class: 'promo-btn' }, pieceIcon(k, color));
        btn.addEventListener('click', () => {
          picker.remove();
          resolve(k);
        });
        row.append(btn);
      }
      picker.append(row);
      this.root.append(picker);
    });
  }

  destroy() {
    this.cg.destroy();
    this.root.remove();
  }
}
