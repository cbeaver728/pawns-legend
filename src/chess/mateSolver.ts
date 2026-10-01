// A small forced-mate solver for puzzle locks (mate in 1–3).
//
// It answers "can the side to move force checkmate within n of its own moves?"
// by brute force with a few cheap tricks: on the final move only mating moves
// count (chess.js already marks them with '#'), checks are tried first, and
// every defence that holds ends the search early.
//
// Kept free of DOM imports so `npm run check:data` can use it from Node.

import { Chess, type Move } from 'chess.js';

/** Checks first, then captures: forcing moves find mates fastest. */
function forcingFirst(moves: Move[]): Move[] {
  const score = (m: Move) => (m.san.includes('#') ? 100 : 0) + (m.san.includes('+') ? 10 : 0) + (m.captured ? 1 : 0);
  return moves.sort((a, b) => score(b) - score(a));
}

/** True if the side to move can force mate within `n` of its moves. */
export function canForceMate(game: Chess, n: number): boolean {
  const moves = game.moves({ verbose: true });
  if (moves.some((m) => m.san.includes('#'))) return true;
  if (n <= 1) return false;
  for (const m of forcingFirst(moves)) {
    game.move(m);
    const wins = everyReplyLoses(game, n - 1);
    game.undo();
    if (wins) return true;
  }
  return false;
}

/** Defender to move: true if every reply still lets the attacker mate within `n`. */
export function everyReplyLoses(game: Chess, n: number): boolean {
  if (game.isCheckmate()) return true;
  if (game.isGameOver()) return false; // stalemate or draw: the defender escaped
  for (const r of game.moves({ verbose: true })) {
    game.move(r);
    const lost = canForceMate(game, n);
    game.undo();
    if (!lost) return false;
  }
  return true;
}

/** Fewest moves the side to move needs to force mate, up to `max` (null if none). */
export function mateLength(game: Chess, max: number): number | null {
  for (let n = 1; n <= max; n++) if (canForceMate(game, n)) return n;
  return null;
}

/**
 * The defender's best reply: the one that delays mate longest (ties broken at
 * random so the puzzle does not always play out the same way).
 * `n` is how many moves the attacker has left.
 */
export function bestDefence(game: Chess, n: number): Move | null {
  const replies = game.moves({ verbose: true });
  if (replies.length === 0) return null;
  let best: Move[] = [];
  let bestLen = -1;
  for (const r of replies) {
    game.move(r);
    const len = mateLength(game, n) ?? n + 1; // escapes entirely = best of all
    game.undo();
    if (len > bestLen) { bestLen = len; best = [r]; }
    else if (len === bestLen) best.push(r);
  }
  return best[Math.floor(Math.random() * best.length)];
}
