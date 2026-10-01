// Chess puzzles that open locked doors. White (the hero) is always to move and
// must force checkmate within `mateIn` moves while the enemy defends as well as
// it can (see chess/mateSolver.ts). Any line that forces mate in time counts,
// not just the one listed.
//
// `npm run check:data` proves every puzzle: legal position, a forced mate in
// exactly `mateIn` (never fewer), and that `solution` really starts one.
//
// Keep this file free of imports so the Node check script can load it directly.

export interface Puzzle {
  id: string;
  title: string;
  /** Shown after two failed tries. */
  hint: string;
  fen: string;
  mateIn: 1 | 2 | 3;
  /** A first move that works, in SAN. Revealed only after several failures. */
  solution: string;
}

export const PUZZLES: Record<string, Puzzle> = {
  // --- Mate in two -----------------------------------------------------------
  deflection: {
    id: 'deflection',
    title: 'The Deflection',
    hint: 'One black rook guards the whole back rank. Lure it away, even if it costs you.',
    fen: '3r2k1/5ppp/8/8/4Q3/8/5PPP/4R1K1 w - - 0 1',
    mateIn: 2,
    solution: 'Qe8+',
  },
  philidor: {
    id: 'philidor',
    title: "Philidor's Legacy",
    hint: 'Give up your queen so the enemy rook walls in its own king. Then a knight finishes it.',
    fen: '4r2k/6pp/8/3Q2N1/2B5/8/5PPP/6K1 w - - 0 1',
    mateIn: 2,
    solution: 'Qg8+',
  },
  boden: {
    id: 'boden',
    title: "Boden's Crossfire",
    hint: 'Two bishops on crossing diagonals can trap a castled king. Rip open its pawn shield first.',
    fen: '2kr4/pp1n4/2n5/8/5B2/5Q2/5PPP/5BK1 w - - 0 1',
    mateIn: 2,
    solution: 'Qxc6+',
  },
  lolli: {
    id: 'lolli',
    title: 'The Silent Threat',
    hint: 'Not every winning move is a check. Your pawn on f6 already guards a deadly square.',
    fen: '3r2k1/p2p1p1p/5Pp1/8/8/8/3Q1PPP/6K1 w - - 0 1',
    mateIn: 2,
    solution: 'Qh6',
  },

  // --- Mate in three ---------------------------------------------------------
  anastasia: {
    id: 'anastasia',
    title: "Anastasia's Trap",
    hint: 'A knight check drives the king into the corner. Then a queen sacrifice opens the h-file for your rook.',
    fen: '5rk1/5ppp/8/3NR3/8/7Q/5PPP/6K1 w - - 0 1',
    mateIn: 3,
    solution: 'Ne7+',
  },
  pillsbury: {
    id: 'pillsbury',
    title: 'The Mirror Vault',
    hint: 'Smash the g-pawn with a rook. Your bishop on the long diagonal is waiting for the king.',
    fen: '5rk1/5ppp/8/8/8/6R1/1B3P1P/5R1K w - - 0 1',
    mateIn: 3,
    solution: 'Rxg7+',
  },
  damiano: {
    id: 'damiano',
    title: "Damiano's Gambit",
    hint: 'Your pawn on g6 guards h7. Sacrifice a rook to drag the king into the corner, then bring the queen down the h-file.',
    fen: '5rk1/5pp1/4p1P1/8/8/7R/5PPP/3Q2K1 w - - 0 1',
    mateIn: 3,
    solution: 'Rh8+',
  },
};
