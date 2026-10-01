// Runs the mate solver off the main thread so the board never freezes while
// the enemy works out its defence.

import { Chess } from 'chess.js';
import { bestDefence, everyReplyLoses } from './mateSolver.ts';

export interface SolverRequest { id: number; fen: string; movesLeft: number }
export interface SolverResponse { id: number; holds: boolean; defence: string | null }

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const { id, fen, movesLeft } = e.data;
  const game = new Chess(fen);
  const holds = everyReplyLoses(game, movesLeft);
  const d = holds ? bestDefence(game, movesLeft) : null;
  const reply: SolverResponse = { id, holds, defence: d ? d.from + d.to + (d.promotion ?? '') : null };
  (self as unknown as Worker).postMessage(reply);
};
