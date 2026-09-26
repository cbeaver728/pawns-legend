// A chess duel against an enemy from the world: pre-battle formation screen,
// the game itself against the chess mind, and the result.

import type { Move } from 'chess.js';
import { playMusic, sfx } from '../audio/sound.ts';
import type { EnemyDef } from '../data/realms.ts';
import type { Theme } from '../data/themes.ts';
import { autoArrange, buildFen, resolveArrangement, type Arrangement } from '../game/army.ts';
import { describePieces, type ModelKind } from '../game/pieces.ts';
import { game } from '../game/state.ts';
import { button, el, screen, wait } from '../ui/dom.ts';
import { formationEditor, formationView } from '../ui/formation.ts';
import { pieceIcon } from '../ui/icons.ts';
import { ChessBoard } from './board.ts';
import { chessMind, MINDS } from './engine.ts';

export type BattleResult = 'win' | 'loss' | 'draw' | 'fled';

export async function runBattle(enemy: EnemyDef, theme: Theme): Promise<BattleResult> {
  playMusic(theme, 'battle');
  void chessMind.warmUp();
  const s = game.s;
  let mine = resolveArrangement(s.arrangement, s.wallet);
  const theirs = autoArrange(enemy.army);

  // ---- Pre-battle: meet the enemy, arrange your army ----------------------
  const pre = screen('battle-pre');
  pre.style.setProperty('--glow', theme.board.glow);
  pre.style.setProperty('--sq-light', theme.board.light);
  pre.style.setProperty('--sq-dark', theme.board.dark);
  const go = await new Promise<boolean>((resolve) => {
    const mind = MINDS[s.difficulty];
    pre.append(
      el('div', { class: 'pre-card' },
        el('div', { class: 'pre-head' },
          pieceIcon(enemy.kind, 'black', 'pre-portrait'),
          el('div', {},
            enemy.boss ? el('div', { class: 'badge boss' }, enemy.final ? 'Final Boss' : 'Boss') : el('div', { class: 'badge' }, 'Challenger'),
            el('h2', {}, enemy.name),
            el('p', { class: 'taunt' }, `“${enemy.taunt}”`),
          ),
        ),
        el('div', { class: 'pre-label' }, `Their army — king + ${describePieces(enemy.army) || 'nothing else'}`),
        formationView(theirs, 'black'),
        el('div', { class: 'pre-label' }, 'Your army'),
        formationEditor(mine, s.wallet, (a) => {
          mine = a;
          s.arrangement = a;
          game.persist();
        }),
        el('div', { class: 'pre-foot' },
          el('span', { class: 'mind' }, `${mind.label} · ${chessMind.engineName}`),
          el('span', { class: 'reward-preview' }, Object.keys(enemy.reward).length ? `Win: ${describePieces(enemy.reward)}` : 'Win: the realm'),
        ),
        el('div', { class: 'pre-actions' },
          button('Retreat', () => { sfx('back'); resolve(false); }, 'btn ghost'),
          button('Begin the Duel', () => { sfx('confirm'); resolve(true); }, 'btn primary'),
        ),
      ),
    );
  });
  pre.remove();
  if (!go) return 'fled';

  return playDuel(enemy, theme, mine, theirs);
}

async function playDuel(enemy: EnemyDef, theme: Theme, mine: Arrangement, theirs: Arrangement): Promise<BattleResult> {
  const s = game.s;
  const scr = screen('battle');
  scr.style.setProperty('--glow', theme.board.glow);
  const board = new ChessBoard(buildFen(mine, theirs), theme);
  if (import.meta.env.DEV) (window as unknown as { __board: ChessBoard }).__board = board;
  chessMind.newGame();

  const status = el('div', { class: 'duel-status' }, 'Your move.');
  const thinking = el('span', { class: 'thinking' });
  const lostMine = el('div', { class: 'captures' });
  const lostTheirs = el('div', { class: 'captures' });
  let resigned = false;
  let resolveResign: (() => void) | null = null;

  const top = el('div', { class: 'duel-bar' },
    pieceIcon(enemy.kind, 'black', 'bar-icon'),
    el('div', { class: 'bar-name' }, enemy.name, thinking),
    lostTheirs,
  );
  const bottom = el('div', { class: 'duel-bar' },
    pieceIcon(game.s.wallet.q ? 'q' : game.s.wallet.r ? 'r' : game.s.wallet.b ? 'b' : game.s.wallet.n ? 'n' : 'p', 'white', 'bar-icon'),
    el('div', { class: 'bar-name' }, 'You'),
    lostMine,
  );
  // Two taps to resign, so a stray tap never ends a long game.
  let armed: number | null = null;
  const resign = button('Resign', () => {
    if (armed === null) {
      resign.textContent = 'Tap again to resign';
      resign.classList.add('armed');
      armed = window.setTimeout(() => {
        armed = null;
        resign.textContent = 'Resign';
        resign.classList.remove('armed');
      }, 3000);
      return;
    }
    clearTimeout(armed);
    resigned = true;
    resolveResign?.();
  }, 'btn ghost small');
  scr.append(el('div', { class: 'duel' }, top, board.root, bottom,
    el('div', { class: 'duel-foot' }, status, resign)));

  const onMove = (m: Move) => {
    if (m.captured) {
      sfx('capture');
      // White captured a black piece → it goes on the hero's side, and vice versa.
      (m.color === 'w' ? lostMine : lostTheirs).append(pieceIcon(m.captured as ModelKind, m.color === 'w' ? 'black' : 'white'));
    } else sfx('move');
    if (board.game.inCheck() && !board.game.isCheckmate()) sfx('check');
  };

  const resignPromise = new Promise<null>((r) => { resolveResign = () => r(null); });

  while (!board.game.isGameOver() && !resigned) {
    if (board.game.turn() === 'w') {
      status.textContent = board.game.inCheck() ? 'You are in check!' : 'Your move.';
      const m = await Promise.race([board.awaitUserMove(), resignPromise]);
      if (!m) break;
      onMove(m);
    } else {
      board.lock();
      status.textContent = `${enemy.name.split(',')[0]} is thinking…`;
      thinking.classList.add('on');
      const uci = await Promise.race([chessMind.bestMove(board.fen, s.difficulty), resignPromise]);
      thinking.classList.remove('on');
      if (resigned) break;
      const m = uci ? board.playUci(uci) : null;
      if (!m) break; // engine had no move: game over is handled below
      onMove(m);
    }
  }
  board.lock();

  let result: BattleResult;
  if (resigned) result = 'loss';
  else if (board.game.isCheckmate()) result = board.game.turn() === 'b' ? 'win' : 'loss';
  else result = 'draw';

  const reason = resigned ? 'You resigned.'
    : board.game.isCheckmate() ? 'Checkmate!'
    : board.game.isStalemate() ? 'Stalemate — nobody can move.'
    : board.game.isInsufficientMaterial() ? 'Not enough pieces left for anyone to checkmate.'
    : board.game.isThreefoldRepetition() ? 'The same position repeated three times.'
    : 'Fifty moves without a capture or pawn move.';

  status.textContent = reason;
  resign.classList.add('hidden');
  if (result === 'win') { s.stats.wins++; sfx('win'); }
  else if (result === 'loss') { s.stats.losses++; sfx('lose'); }
  else s.stats.draws++;
  game.persist();

  await wait(result === 'win' ? 900 : 500);
  await new Promise<void>((resolve) => {
    const title = { win: 'Victory!', loss: 'Defeated', draw: 'A Draw', fled: '' }[result];
    const line = result === 'win' ? enemy.defeat
      : result === 'loss' ? `${enemy.name.split(',')[0]} stands firm. Collect more pieces, or try a new plan — you can challenge again any time.`
      : 'Neither side could finish the game. Challenge again to claim the win.';
    scr.append(el('div', { class: `duel-result ${result}` },
      el('div', { class: 'result-card' },
        el('div', { class: 'result-reason' }, reason),
        el('h2', {}, title),
        el('p', {}, result === 'win' ? `“${line}”` : line),
        button('Continue', () => { sfx('confirm'); resolve(); }, 'btn primary'),
      )));
  });
  board.destroy();
  scr.remove();
  return result;
}
