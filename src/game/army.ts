// Turning a collection of pieces into a starting chess position.
//
// Rules of the realm:
//   * Pawns may only stand on the pawn rank (2nd for you, 7th for the enemy).
//   * Every other piece stands on the back rank, with the king always present.
//   * So at most 8 pawns and 7 back-rank pieces take the field; extras wait on the bench.

import { MAJOR_KINDS, MAX_BACK_RANK, MAX_PAWNS, type ModelKind, type PieceKind, type Wallet } from './pieces.ts';

export type Square = ModelKind | '';

export interface Arrangement {
  /** Files a..h of the back rank, from that side's own point of view (a = left for white). */
  back: Square[];
  /** Files a..h of the pawn rank. */
  pawns: boolean[];
}

const FILES = 'abcdefgh';
/** Traditional home squares for each piece (file indexes). */
const HOME: Record<Exclude<PieceKind, 'p'>, number[]> = {
  q: [3],
  r: [0, 7],
  b: [2, 5],
  n: [1, 6],
};
/** Where extra pieces go once the traditional squares are full: centre outwards. */
const EXTRA_ORDER = [3, 2, 5, 1, 6, 0, 7];
/** Pawn files filled first: the centre, then the wings. */
const PAWN_ORDER = [4, 3, 5, 2, 6, 1, 7, 0];

export function autoArrange(w: Partial<Wallet>): Arrangement {
  const back: Square[] = Array(8).fill('');
  back[4] = 'k';
  const left: Record<string, number> = {};
  for (const k of MAJOR_KINDS) left[k] = w[k] ?? 0;

  let placed = 0;
  for (const k of MAJOR_KINDS) {
    for (const f of HOME[k]) {
      if (left[k] > 0 && back[f] === '' && placed < MAX_BACK_RANK) {
        back[f] = k;
        left[k]--;
        placed++;
      }
    }
  }
  for (const k of MAJOR_KINDS) {
    while (left[k] > 0 && placed < MAX_BACK_RANK) {
      const f = EXTRA_ORDER.find((i) => back[i] === '');
      if (f === undefined) break;
      back[f] = k;
      left[k]--;
      placed++;
    }
  }

  const pawns: boolean[] = Array(8).fill(false);
  const nPawns = Math.min(MAX_PAWNS, w.p ?? 0);
  for (let i = 0; i < nPawns; i++) pawns[PAWN_ORDER[i]] = true;
  return { back, pawns };
}

/** How many of each piece an arrangement uses. */
export function arrangementCounts(a: Arrangement): Wallet {
  const c: Wallet = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const s of a.back) if (s && s !== 'k') c[s]++;
  c.p = a.pawns.filter(Boolean).length;
  return c;
}

/** True if the arrangement is legal and only uses pieces the wallet actually holds. */
export function isValidArrangement(a: Arrangement | undefined, w: Wallet): a is Arrangement {
  if (!a || a.back?.length !== 8 || a.pawns?.length !== 8) return false;
  if (a.back.filter((s) => s === 'k').length !== 1) return false;
  const c = arrangementCounts(a);
  for (const k of MAJOR_KINDS) if (c[k] > w[k]) return false;
  if (c.p > w.p) return false;
  return true;
}

/**
 * A saved custom arrangement if it is still valid, otherwise the auto one.
 * Pieces collected since the last save are slotted into empty squares so new
 * rewards are never silently left on the bench.
 */
export function resolveArrangement(saved: Arrangement | undefined, w: Wallet): Arrangement {
  if (!isValidArrangement(saved, w)) return autoArrange(w);
  const a: Arrangement = { back: [...saved.back], pawns: [...saved.pawns] };
  const bench = benchOf(a, w);
  for (const k of MAJOR_KINDS) {
    while (bench[k] > 0) {
      const f = EXTRA_ORDER.find((i) => a.back[i] === '');
      if (f === undefined) break;
      a.back[f] = k;
      bench[k]--;
    }
  }
  while (bench.p > 0) {
    const f = PAWN_ORDER.find((i) => !a.pawns[i]);
    if (f === undefined) break;
    a.pawns[f] = true;
    bench.p--;
  }
  return a;
}

/** Pieces owned but not placed on the board. */
export function benchOf(a: Arrangement, w: Wallet): Wallet {
  const c = arrangementCounts(a);
  return { p: w.p - c.p, n: w.n - c.n, b: w.b - c.b, r: w.r - c.r, q: w.q - c.q };
}

function rankString(squares: string[]): string {
  let out = '';
  let gap = 0;
  for (const s of squares) {
    if (!s) { gap++; continue; }
    if (gap) { out += gap; gap = 0; }
    out += s;
  }
  if (gap) out += gap;
  return out;
}

/**
 * Builds the starting FEN. White is always the hero. Black's arrangement is
 * written from white's point of view (file a = white's left), which means the
 * enemy king faces ours on the e-file exactly as in a normal game.
 */
export function buildFen(white: Arrangement, black: Arrangement): string {
  const up = (s: Square) => (s ? s.toUpperCase() : '');
  const ranks = [
    rankString(black.back.map((s) => s)),
    rankString(black.pawns.map((p) => (p ? 'p' : ''))),
    '8', '8', '8', '8',
    rankString(white.pawns.map((p) => (p ? 'P' : ''))),
    rankString(white.back.map(up)),
  ];
  let castle = '';
  if (white.back[4] === 'k' && white.back[7] === 'r') castle += 'K';
  if (white.back[4] === 'k' && white.back[0] === 'r') castle += 'Q';
  if (black.back[4] === 'k' && black.back[7] === 'r') castle += 'k';
  if (black.back[4] === 'k' && black.back[0] === 'r') castle += 'q';
  return `${ranks.join('/')} w ${castle || '-'} - 0 1`;
}

export function squareName(file: number, rank: number): string {
  return `${FILES[file]}${rank}`;
}
