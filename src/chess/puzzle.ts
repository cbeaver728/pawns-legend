// Puzzle locks: solve the position on the door to open it.

import { playMusic, sfx } from '../audio/sound.ts';
import type { Puzzle } from '../data/puzzles.ts';
import type { Theme } from '../data/themes.ts';
import { game } from '../game/state.ts';
import { button, el, screen, wait } from '../ui/dom.ts';
import { ChessBoard } from './board.ts';

export async function runPuzzle(puzzle: Puzzle, theme: Theme, doorName: string): Promise<boolean> {
  playMusic(theme, 'battle');
  const scr = screen('battle puzzle');
  scr.style.setProperty('--glow', theme.board.glow);
  const board = new ChessBoard(puzzle.fen, theme);
  const status = el('div', { class: 'duel-status' }, 'White to move. Find checkmate in one.');
  const hint = el('div', { class: 'puzzle-hint' });
  let tries = 0;
  let left = false;
  let leave: (() => void) | null = null;
  const leavePromise = new Promise<null>((r) => { leave = () => r(null); });

  const showHint = () => {
    hint.textContent = `Hint: ${puzzle.hint}`;
    hint.classList.add('on');
  };

  scr.append(el('div', { class: 'duel' },
    el('div', { class: 'puzzle-head' },
      el('div', { class: 'badge' }, doorName),
      el('h2', {}, puzzle.title),
    ),
    board.root,
    el('div', { class: 'duel-foot' }, status,
      button('Hint', () => { sfx('select'); showHint(); }, 'btn ghost small'),
      button('Leave', () => { left = true; leave?.(); }, 'btn ghost small')),
    hint,
  ));

  let solved = false;
  while (!solved && !left) {
    const move = await Promise.race([board.awaitUserMove(), leavePromise]);
    if (!move) break;
    sfx(move.captured ? 'capture' : 'move');
    if (board.game.isCheckmate()) {
      solved = true;
      break;
    }
    tries++;
    board.lock();
    status.textContent = board.game.inCheck() ? 'Check — but the king escapes. Try again.' : 'Not checkmate. Try again.';
    sfx('locked');
    if (tries >= 2) showHint();
    await wait(1000);
    board.reset(puzzle.fen);
    status.textContent = 'White to move. Find checkmate in one.';
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
