// Title screen, difficulty picker, pause menu and the ending.

import { setSound, sfx } from '../audio/sound.ts';
import { chessMind, MINDS } from '../chess/engine.ts';
import { resolveArrangement } from '../game/army.ts';
import { describePieces, MAX_BACK_RANK, MAX_PAWNS } from '../game/pieces.ts';
import { game, type Difficulty, type SaveData } from '../game/state.ts';
import { button, el, screen } from './dom.ts';
import { formationEditor } from './formation.ts';
import { pieceIcon } from './icons.ts';

export type TitleChoice = { kind: 'continue' } | { kind: 'new'; difficulty: Difficulty };

export function titleScreen(existing: SaveData | null): Promise<TitleChoice> {
  return new Promise((resolve) => {
    const scr = screen('title');
    const logo = el('div', { class: 'logo' },
      el('div', { class: 'logo-pieces' }, pieceIcon('p'), pieceIcon('n'), pieceIcon('b'), pieceIcon('r'), pieceIcon('q'), pieceIcon('k')),
      el('h1', {}, "Pawn's Legend"),
      el('div', { class: 'logo-sub' }, 'A Chess Adventure Across the Sixty-Four Realms'),
    );
    const menu = el('div', { class: 'title-menu' });
    const done = (c: TitleChoice) => { scr.remove(); resolve(c); };

    const main = () => {
      menu.replaceChildren();
      if (existing) {
        const w = existing.wallet;
        menu.append(button(el('span', {}, 'Continue', el('small', {}, `${MINDS[existing.difficulty].label} · ${describePieces(w)}`)),
          () => { sfx('confirm'); done({ kind: 'continue' }); }, 'btn primary big'));
      }
      menu.append(button('New Game', () => { sfx('select'); pickDifficulty(); }, existing ? 'btn big' : 'btn primary big'));
    };

    const pickDifficulty = () => {
      menu.replaceChildren(el('div', { class: 'pick-title' }, 'Choose your opponent’s chess mind'));
      for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
        const m = MINDS[d];
        menu.append(button(el('span', {}, m.label, el('small', {}, m.blurb)), () => {
          if (existing && !confirm('Start over? Your current adventure will be erased.')) return;
          sfx('confirm');
          done({ kind: 'new', difficulty: d });
        }, `btn big mind-${d}`));
      }
      menu.append(el('p', { class: 'pick-note' },
        'This sets how well every enemy plays for the whole adventure. Bosses do not think harder — they bring more pieces. The Black King fields a full army of sixteen.'));
      menu.append(button('Back', () => { sfx('back'); main(); }, 'btn ghost'));
    };

    main();
    scr.append(logo, menu, el('div', { class: 'title-foot' }, 'Chess engine: Stockfish 19 (GPLv3) · Pieces: cburnett'));
    // Start downloading the engine while the player reads the menu.
    void chessMind.warmUp();
  });
}

export type MenuResult = 'resume' | 'quit';

export function pauseMenu(realmName: string): Promise<MenuResult> {
  return new Promise((resolve) => {
    const s = game.s;
    const scr = screen('pause');
    const body = el('div', { class: 'pause-body' });
    const card = el('div', { class: 'pause-card' }, el('h2', {}, 'Paused'), el('div', { class: 'pause-realm' }, realmName), body);
    scr.append(card);
    const close = (r: MenuResult) => { scr.remove(); resolve(r); };

    const main = () => {
      body.replaceChildren(
        button('Resume', () => { sfx('confirm'); close('resume'); }, 'btn primary'),
        button('Your Army', () => { sfx('select'); army(); }, 'btn'),
        button('Settings', () => { sfx('select'); settings(); }, 'btn'),
        button('How to Play', () => { sfx('select'); help(); }, 'btn'),
        button('Save & Quit to Title', () => { sfx('back'); game.persist(); close('quit'); }, 'btn ghost'),
        el('div', { class: 'pause-stats' },
          `Duels won ${s.stats.wins} · lost ${s.stats.losses} · drawn ${s.stats.draws} · puzzles solved ${s.stats.puzzles}`),
      );
    };

    const army = () => {
      const w = s.wallet;
      body.replaceChildren(
        el('p', { class: 'pause-note' },
          `You carry ${describePieces(w)} and your King. Up to ${MAX_PAWNS} pawns fill your front rank; up to ${MAX_BACK_RANK} other pieces stand beside the King. Arrange them here or before any duel.`),
        formationEditor(resolveArrangement(s.arrangement, w), w, (a) => { s.arrangement = a; game.persist(); }),
        button('Back', () => { sfx('back'); main(); }, 'btn ghost'),
      );
    };

    const settings = () => {
      const toggle = (label: string, key: 'music' | 'sfx') => {
        const b = button(`${label}: ${s.settings[key] ? 'On' : 'Off'}`, () => {
          s.settings[key] = !s.settings[key];
          setSound(s.settings);
          game.persist();
          b.textContent = `${label}: ${s.settings[key] ? 'On' : 'Off'}`;
          sfx('select');
        }, 'btn');
        return b;
      };
      const minds = el('div', { class: 'mind-row' });
      const drawMinds = () => {
        minds.replaceChildren();
        for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
          minds.append(button(MINDS[d].label.replace(' Mind', ''), () => {
            s.difficulty = d;
            game.persist();
            sfx('select');
            drawMinds();
          }, `btn small ${s.difficulty === d ? 'primary' : 'ghost'}`));
        }
      };
      drawMinds();
      body.replaceChildren(
        toggle('Music', 'music'),
        toggle('Sound effects', 'sfx'),
        el('div', { class: 'pause-label' }, `Chess mind (${chessMind.engineName})`),
        minds,
        button('Back', () => { sfx('back'); main(); }, 'btn ghost'),
      );
    };

    const help = () => {
      body.replaceChildren(
        el('div', { class: 'help' },
          el('h3', {}, 'Explore'),
          el('p', {}, 'PC: WASD or arrow keys to move · drag the mouse or press Q / R to turn the camera · E to talk, open and challenge · Space to leap (once you are a Knight) · Esc for this menu.'),
          el('p', {}, 'Phone: drag on the left half to move · drag on the right half to turn the camera · A to act · B to leap.'),
          el('h3', {}, 'Duel'),
          el('p', {}, 'Every enemy fights with chess. You play White and move first. Checkmate them to capture the pieces they guard. Tap or drag a piece to move it.'),
          el('h3', {}, 'Grow your army'),
          el('p', {}, 'Pawns stand on your front rank — eight at most. Every other piece stands on the back rank beside your King. Collect eight Rooks and you can field seven of them!'),
          el('h3', {}, 'Open the way'),
          el('p', {}, 'Gates on the Grand Board need a piece: a Knight for the Desert, a Bishop for the Ice, a Rook for the Stars, a Queen for the Throne. Locked doors open when you solve their chess puzzle.'),
        ),
        button('Back', () => { sfx('back'); main(); }, 'btn ghost'),
      );
    };

    main();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { removeEventListener('keydown', onKey); close('resume'); }
    };
    addEventListener('keydown', onKey);
  });
}

export function endingScreen(): Promise<void> {
  const s = game.s;
  return new Promise((resolve) => {
    const scr = screen('ending');
    scr.append(el('div', { class: 'ending-card' },
      el('div', { class: 'logo-pieces' }, pieceIcon('k')),
      el('h1', {}, 'The Board Is Whole'),
      el('p', {}, 'Morthos has fallen. The sixty-four realms knit back together, square by square, and a humble pawn stands where a king once ruled.'),
      el('p', { class: 'ending-stats' },
        `${MINDS[s.difficulty].label} · ${s.stats.wins} duels won · ${s.stats.puzzles} puzzles solved · army: ${describePieces(s.wallet)}`),
      el('p', {}, 'The realms remain open. Wander back any time — there may be pieces you missed.'),
      button('Keep Exploring', () => { sfx('confirm'); scr.remove(); resolve(); }, 'btn primary big'),
    ));
  });
}
