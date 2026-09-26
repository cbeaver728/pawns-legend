// The two-rank "formation" strip shown before every duel: the enemy's army
// (read only) and yours, which you can rearrange by tapping two squares.

import { benchOf, type Arrangement } from '../game/army.ts';
import { MAJOR_KINDS, PIECE_NAMES, type Wallet } from '../game/pieces.ts';
import { sfx } from '../audio/sound.ts';
import { el } from './dom.ts';
import { pieceIcon } from './icons.ts';

type Pick = { row: 'back' | 'pawn'; i: number } | { row: 'bench'; kind: Exclude<keyof Wallet, 'p'> } | null;

function cell(light: boolean, content: HTMLElement | null, extra = ''): HTMLElement {
  const c = el('div', { class: `fcell ${light ? 'l' : 'd'} ${extra}`.trim() });
  if (content) c.append(content);
  return c;
}

/** Read-only view. For black, rows are drawn back rank on top, like the real board. */
export function formationView(a: Arrangement, color: 'white' | 'black'): HTMLElement {
  const grid = el('div', { class: 'formation' });
  const backRow = el('div', { class: 'frow' });
  const pawnRow = el('div', { class: 'frow' });
  for (let f = 0; f < 8; f++) {
    const s = a.back[f];
    // Square colours match the real board: a1 dark, a8 light.
    const backLight = color === 'white' ? f % 2 === 1 : f % 2 === 0;
    backRow.append(cell(backLight, s ? pieceIcon(s, color) : null));
    pawnRow.append(cell(!backLight, a.pawns[f] ? pieceIcon('p', color) : null));
  }
  if (color === 'black') grid.append(backRow, pawnRow);
  else grid.append(pawnRow, backRow);
  return grid;
}

/** Editable view of the hero's formation. Calls onChange with each new arrangement. */
export function formationEditor(start: Arrangement, wallet: Wallet, onChange: (a: Arrangement) => void): HTMLElement {
  let a: Arrangement = { back: [...start.back], pawns: [...start.pawns] };
  let pick: Pick = null;
  const root = el('div', { class: 'formation-editor' });

  const render = () => {
    root.replaceChildren();
    const grid = el('div', { class: 'formation editable' });
    const pawnRow = el('div', { class: 'frow' });
    const backRow = el('div', { class: 'frow' });
    for (let f = 0; f < 8; f++) {
      const pc = cell(f % 2 === 0, a.pawns[f] ? pieceIcon('p') : null,
        pick?.row === 'pawn' && pick.i === f ? 'picked' : '');
      pc.addEventListener('click', () => tap({ row: 'pawn', i: f }));
      pawnRow.append(pc);
      const s = a.back[f];
      const bc = cell(f % 2 === 1, s ? pieceIcon(s) : null,
        pick?.row === 'back' && pick.i === f ? 'picked' : '');
      bc.addEventListener('click', () => tap({ row: 'back', i: f }));
      backRow.append(bc);
    }
    grid.append(pawnRow, backRow);

    const bench = benchOf(a, wallet);
    const benchRow = el('div', { class: 'bench' }, el('span', { class: 'bench-label' }, 'Bench'));
    let any = false;
    for (const k of MAJOR_KINDS) {
      for (let n = 0; n < bench[k]; n++) {
        any = true;
        const b = el('button', { class: `bench-piece ${pick?.row === 'bench' && pick.kind === k ? 'picked' : ''}`, title: PIECE_NAMES[k] }, pieceIcon(k));
        b.addEventListener('click', () => tap({ row: 'bench', kind: k }));
        benchRow.append(b);
      }
    }
    if (!any) benchRow.append(el('span', { class: 'bench-empty' }, pick?.row === 'back' ? 'Tap here to bench the piece' : 'Every piece is on the board'));
    benchRow.addEventListener('click', (e) => {
      if (e.target === benchRow || (e.target as HTMLElement).classList.contains('bench-empty') || (e.target as HTMLElement).classList.contains('bench-label')) {
        if (pick?.row === 'back' && a.back[pick.i] && a.back[pick.i] !== 'k') {
          a.back[pick.i] = '';
          pick = null;
          commit();
        }
      }
    });
    root.append(grid, benchRow, el('div', { class: 'formation-help' },
      'Tap two squares to swap them. Pawns stay on the front rank; everything else stands behind.'));
  };

  const commit = () => {
    sfx('move');
    onChange({ back: [...a.back], pawns: [...a.pawns] });
    render();
  };

  const tap = (t: Exclude<Pick, null>) => {
    if (!pick) {
      // Nothing selected yet: select something that holds a piece.
      if (t.row === 'back' && !a.back[t.i]) return;
      if (t.row === 'pawn' && !a.pawns[t.i]) return;
      pick = t;
      sfx('select');
      render();
      return;
    }
    const p = pick;
    pick = null;
    if (p.row === 'back' && t.row === 'back') {
      [a.back[p.i], a.back[t.i]] = [a.back[t.i], a.back[p.i]];
      if (p.i !== t.i) return commit();
    } else if (p.row === 'pawn' && t.row === 'pawn') {
      [a.pawns[p.i], a.pawns[t.i]] = [a.pawns[t.i], a.pawns[p.i]];
      if (p.i !== t.i) return commit();
    } else if (p.row === 'bench' && t.row === 'back') {
      if (a.back[t.i] === 'k') { sfx('locked'); render(); return; }
      a.back[t.i] = p.kind;
      return commit();
    } else if (p.row === 'back' && t.row === 'bench') {
      if (a.back[p.i] === 'k') { sfx('locked'); render(); return; }
      a.back[p.i] = t.kind;
      return commit();
    } else {
      // Pawns and back-rank pieces never trade places.
      sfx('locked');
    }
    render();
  };

  render();
  return root;
}
