// Chess puzzles that open locked doors. White (the hero) is always to move.
//
// goal 'mate1': any move that delivers checkmate solves it, so a puzzle can
// never be "wrong" because it has two mates. `npm run check:data` proves every
// puzzle here really has a mate in one.
//
// Keep this file free of imports so the Node check script can load it directly.

export interface Puzzle {
  id: string;
  title: string;
  hint: string;
  fen: string;
  goal: 'mate1';
}

export const PUZZLES: Record<string, Puzzle> = {
  ladder: {
    id: 'ladder',
    title: 'The Rook Ladder',
    hint: 'A rook on the edge of the board is a wall the king cannot cross.',
    fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1',
    goal: 'mate1',
  },
  backrank: {
    id: 'backrank',
    title: 'The Hedge Gate',
    hint: 'The king has hidden behind his own pawns. Too well.',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    goal: 'mate1',
  },
  smothered: {
    id: 'smothered',
    title: 'The Smothered King',
    hint: 'Only one piece can jump over walls of its own army.',
    fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    goal: 'mate1',
  },
  arabian: {
    id: 'arabian',
    title: 'The Arabian Seal',
    hint: 'Rook and knight together — an ancient desert pattern.',
    fen: '7k/7p/5N2/8/8/8/8/6RK w - - 0 1',
    goal: 'mate1',
  },
  scholar: {
    id: 'scholar',
    title: "The Scholar's Door",
    hint: 'The weakest square in the opening is next to the king.',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    goal: 'mate1',
  },
  queenkiss: {
    id: 'queenkiss',
    title: "The Queen's Kiss",
    hint: 'Your king can guard the queen as she steps right up to theirs.',
    fen: '7k/Q7/6K1/8/8/8/8/8 w - - 0 1',
    goal: 'mate1',
  },
  corridor: {
    id: 'corridor',
    title: 'The Frozen Corridor',
    hint: 'The king is trapped in a hallway of ice. Close the door.',
    fen: '1k6/ppp5/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    goal: 'mate1',
  },
  bishops: {
    id: 'bishops',
    title: 'Crossed Diagonals',
    hint: 'Two bishops can cover a whole corner between them.',
    fen: 'k7/8/1K6/4B3/8/8/8/5B2 w - - 0 1',
    goal: 'mate1',
  },
  mirror: {
    id: 'mirror',
    title: 'The Mirror Vault',
    hint: 'A queen guarded by a bishop can walk right up to the king.',
    fen: 'r4rk1/ppp2pp1/8/7Q/8/3B4/5PPP/6K1 w - - 0 1',
    goal: 'mate1',
  },
};
