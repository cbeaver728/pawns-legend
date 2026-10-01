// Puzzle locks: force checkmate within N moves to open the door. The enemy
// defends with its best reply, worked out by the mate solver in a worker.

import { Chess } from 'chess.js';
import { playMusic, sfx } from '../audio/sound.ts';
import type { Puzzle } from '../data/puzzles.ts';
import type { Theme } from '../data/themes.ts';
import { game } from '../game/state.ts';
import { button, el, screen, wait } from '../ui/dom.ts';
import { ChessBoard } from './board.ts';
import { bestDefence, everyReplyLoses } from './mateSolver.ts';
import type { SolverRequest, SolverResponse } from './solver.worker.ts';
import SolverWorker from './solver.worker.ts?worker';

// ---------------------------------------------------------------------------
// Solver access: a worker when possible, the same code inline if not.

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: SolverResponse) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new SolverWorker();
    worker.onmessage = (e: MessageEvent<SolverResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * After the hero's move: does a forced mate within `movesLeft` still exist,
 * and if so, which defence does the enemy choose?
 */
function judge(fen: string, movesLeft: number): Promise<SolverResponse> {
  const w = getWorker();
  if (w) {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      w.postMessage({ id, fen, movesLeft } satisfies SolverRequest);
    });
  }
  const g = new Chess(fen);
  const holds = everyReplyLoses(g, movesLeft);
  const d = holds ? bestDefence(g, movesLeft) : null;
  return Promise.resolve({ id: 0, holds, defence: d ? d.from + d.to + (d.promotion ?? '') : null });
}

// ---------------------------------------------------------------------------

const MOVES = ['', 'one', 'two', 'three'];

export async function runPuzzle(puzzle: Puzzle, theme: Theme, doorName: string): Promise<boolean> {
  playMusic(theme, 'battle');
  getWorker(); // spin it up while the player looks at the board
  const scr = screen('battle puzzle');
  scr.style.setProperty('--glow', theme.board.glow);
  const board = new ChessBoard(puzzle.fen, theme);
  const goal = `White to move. Force checkmate in ${MOVES[puzzle.mateIn]}.`;
  const status = el('div', { class: 'duel-status' }, goal);
  const pips = el('div', { class: 'puzzle-pips' });
  const hint = el('div', { class: 'puzzle-hint' });
  let tries = 0;
  let left = false;
  let leave: (() => void) | null = null;
  const leavePromise = new Promise<null>((r) => { leave = () => r(null); });

  const drawPips = (used: number) => {
    pips.replaceChildren();
    for (let i = 0; i < puzzle.mateIn; i++) pips.append(el('span', { class: i < used ? 'used' : '' }));
  };
  const showHint = () => {
    hint.textContent = tries >= 4 ? `Hint: ${puzzle.hint} Try starting with ${puzzle.solution}.` : `Hint: ${puzzle.hint}`;
    hint.classList.add('on');
  };

  scr.append(el('div', { class: 'duel' },
    el('div', { class: 'puzzle-head' },
      el('div', { class: 'badge' }, doorName),
      el('h2', {}, puzzle.title),
      el('div', { class: 'puzzle-goal' }, `Mate in ${puzzle.mateIn}`, pips),
    ),
    board.root,
    el('div', { class: 'duel-foot' }, status,
      button('Hint', () => { sfx('select'); showHint(); }, 'btn ghost small'),
      button('Leave', () => { left = true; leave?.(); }, 'btn ghost small')),
    hint,
  ));

  const fail = async (why: string) => {
    tries++;
    board.lock();
    status.textContent = `${why} The lock resets.`;
    sfx('locked');
    if (tries >= 2) showHint();
    await wait(1400);
    board.reset(puzzle.fen);
    drawPips(0);
    status.textContent = goal;
  };

  let solved = false;
  let used = 0;
  drawPips(0);
  while (!solved && !left) {
    const move = await Promise.race([board.awaitUserMove(), leavePromise]);
    if (!move) break;
    sfx(move.captured ? 'capture' : 'move');
    used++;
    drawPips(used);
    if (board.game.isCheckmate()) {
      solved = true;
      break;
    }
    const movesLeft = puzzle.mateIn - used;
    if (movesLeft <= 0) {
      await fail(board.game.inCheck() ? 'Check — but the king escapes.' : 'Not checkmate.');
      used = 0;
      continue;
    }

    // The enemy looks for a way out.
    board.lock();
    status.textContent = 'The enemy considers its defence…';
    const [verdict] = await Promise.all([judge(board.fen, movesLeft), wait(500)]);
    if (left) break;
    if (!verdict.holds || !verdict.defence) {
      await fail(board.game.isStalemate() ? 'Stalemate! The king has no moves but is not in check.' : 'That gives the enemy a way to escape.');
      used = 0;
      continue;
    }
    const reply = board.playUci(verdict.defence);
    if (reply) sfx(reply.captured ? 'capture' : 'move');
    status.textContent = `The enemy plays ${reply?.san ?? '…'}. ${movesLeft === 1 ? 'Deliver checkmate!' : `Mate in ${MOVES[movesLeft]} more.`}`;
  }
  board.lock();

  if (solved) {
    game.s.stats.puzzles++;
    game.persist();
    status.textContent = 'Checkmate! The lock gives way.';
    scr.classList.add('solved');
    sfx('win');
    await wait(1600);
  }
  board.destroy();
  scr.remove();
  return solved;
}
