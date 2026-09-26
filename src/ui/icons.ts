// Chess piece icons for menus and the HUD, reusing the board's own piece art
// (cburnett set, bundled with chessground) so every piece looks the same.

import type { ModelKind } from '../game/pieces.ts';
import { el } from './dom.ts';

const ROLE: Record<ModelKind, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function pieceIcon(kind: ModelKind, color: 'white' | 'black' = 'white', cls = ''): HTMLElement {
  const wrap = el('span', { class: `cg-wrap pi ${cls}`.trim() });
  const piece = document.createElement('piece');
  piece.className = `${ROLE[kind]} ${color}`;
  wrap.append(piece);
  return wrap;
}
