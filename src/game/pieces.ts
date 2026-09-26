// Piece kinds, the player's "wallet" of collected pieces, and the forms the
// hero takes as they climb the ranks.

export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q';
/** Everything that can be drawn in 3D, including the king. */
export type ModelKind = PieceKind | 'k';

export type Wallet = Record<PieceKind, number>;

export const PIECE_KINDS: PieceKind[] = ['p', 'n', 'b', 'r', 'q'];
/** Non-pawn pieces, strongest first (used for back-rank ordering and forms). */
export const MAJOR_KINDS: Exclude<PieceKind, 'p'>[] = ['q', 'r', 'b', 'n'];

export const PIECE_NAMES: Record<ModelKind, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
};
export const PIECE_PLURALS: Record<ModelKind, string> = {
  p: 'Pawns', n: 'Knights', b: 'Bishops', r: 'Rooks', q: 'Queens', k: 'Kings',
};

/** Only eight pawns fit on the second rank. */
export const MAX_PAWNS = 8;
/** Eight back-rank squares, one of which always belongs to the king. */
export const MAX_BACK_RANK = 7;

export const STARTING_WALLET: Wallet = { p: 3, n: 0, b: 0, r: 0, q: 0 };

export function emptyWallet(): Wallet {
  return { p: 0, n: 0, b: 0, r: 0, q: 0 };
}

export function walletTotal(w: Wallet): number {
  return PIECE_KINDS.reduce((s, k) => s + w[k], 0);
}

/** Adds pieces, respecting the pawn cap. Returns what was actually added. */
export function addToWallet(w: Wallet, add: Partial<Wallet>): Partial<Wallet> {
  const added: Partial<Wallet> = {};
  for (const k of PIECE_KINDS) {
    const n = add[k] ?? 0;
    if (!n) continue;
    const room = k === 'p' ? Math.max(0, MAX_PAWNS - w.p) : n;
    const take = Math.min(n, room);
    if (take > 0) {
      w[k] += take;
      added[k] = take;
    }
  }
  return added;
}

export function describePieces(p: Partial<Wallet>): string {
  const parts: string[] = [];
  for (const k of [...MAJOR_KINDS, 'p'] as PieceKind[]) {
    const n = p[k] ?? 0;
    if (n > 0) parts.push(`${n} ${n === 1 ? PIECE_NAMES[k] : PIECE_PLURALS[k]}`);
  }
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Hero forms. The hero looks like the most advanced piece they have earned.

export interface Form {
  kind: ModelKind;
  title: string;
  speed: number;       // world units per second
  canJump: boolean;    // Knight's Leap and beyond
  jumpPower: number;
}

export const FORMS: Record<PieceKind, Form> = {
  p: { kind: 'p', title: 'Humble Pawn', speed: 6.2, canJump: false, jumpPower: 0 },
  n: { kind: 'n', title: 'Leaping Knight', speed: 7.4, canJump: true, jumpPower: 8.5 },
  b: { kind: 'b', title: 'Swift Bishop', speed: 8.4, canJump: true, jumpPower: 8.5 },
  r: { kind: 'r', title: 'Iron Rook', speed: 9.0, canJump: true, jumpPower: 9 },
  q: { kind: 'q', title: 'Radiant Queen', speed: 10.2, canJump: true, jumpPower: 10 },
};

/** Order in which forms unlock; the hero takes the highest one owned. */
const FORM_ORDER: PieceKind[] = ['q', 'r', 'b', 'n'];

export function currentForm(w: Wallet): Form {
  for (const k of FORM_ORDER) if (w[k] > 0) return FORMS[k];
  return FORMS.p;
}
