// A small, dependable chess mind used only when Stockfish cannot load.
// Negamax with alpha-beta over chess.js, material plus a centre bonus.

import { Chess, type Move } from 'chess.js';
import type { Difficulty } from '../game/state.ts';

const VALUE: Record<string, number> = { p: 100, n: 310, b: 330, r: 500, q: 900, k: 0 };
const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
const MATE = 100000;

function evaluate(game: Chess): number {
  // Score from the point of view of the side to move.
  let score = 0;
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (!sq) continue;
      let v = VALUE[sq.type];
      // Pieces like the centre; pawns like to advance.
      const centre = 3.5 - Math.max(Math.abs(3.5 - r), Math.abs(3.5 - f));
      if (sq.type !== 'k') v += centre * 6;
      if (sq.type === 'p') v += (sq.color === 'w' ? 6 - r : r - 1) * 8;
      score += sq.color === 'w' ? v : -v;
    }
  }
  return game.turn() === 'w' ? score : -score;
}

function ordered(game: Chess): Move[] {
  // Captures and promotions first: much better pruning.
  return game.moves({ verbose: true }).sort((a, b) => {
    const s = (m: Move) => (m.captured ? VALUE[m.captured] - VALUE[m.piece] / 10 : 0) + (m.promotion ? 800 : 0);
    return s(b) - s(a);
  });
}

function negamax(game: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  if (game.isCheckmate()) return -MATE + ply;
  if (game.isDraw()) return 0;
  if (depth === 0) return evaluate(game);
  let best = -Infinity;
  for (const m of ordered(game)) {
    game.move(m);
    const score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
    game.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export function fallbackMove(fen: string, difficulty: Difficulty): string | null {
  const game = new Chess(fen);
  const moves = ordered(game);
  if (moves.length === 0) return null;
  let best: Move[] = [];
  let bestScore = -Infinity;
  for (const m of moves) {
    game.move(m);
    const score = -negamax(game, DEPTH[difficulty] - 1, -Infinity, Infinity, 1);
    game.undo();
    if (score > bestScore + 5) {
      bestScore = score;
      best = [m];
    } else if (Math.abs(score - bestScore) <= 5) {
      best.push(m);
    }
  }
  const m = best[Math.floor(Math.random() * best.length)];
  return m.from + m.to + (m.promotion ?? '');
}
