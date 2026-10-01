# Pawn's Legend

A Zelda-style 3D adventure where the treasure is chess pieces. You start as a humble
pawn with three pawns and a king, explore themed realms, and every enemy fights you
at the chessboard. Checkmate them to capture their pieces and grow your army — and
your hero's form — until you can face Morthos, the Black King, and his full army of
sixteen.

**Play:** https://cbeaver728.github.io/pawns-legend/ (PC or phone; add it to your
home screen for full-screen play).

## How it plays

- **Explore** in 3D (Ocarina-of-Time-style follow camera). PC: WASD/arrows, drag or
  Q/R to turn the camera, E to act, Space to leap. Phone: left thumb = joystick,
  right side = camera, A = act, B = leap.
- **Duel**: walking up to an enemy and pressing A opens a pre-battle screen showing
  both armies. You play White on a 2D board against the chess mind.
- **Army rules**: pawns only stand on your 2nd rank (max 8). Every other piece stands
  on the back rank beside your king (max 7 besides the king). Extra pieces wait on the
  bench; arrange everything before any duel or from the pause menu.
- **Difficulty** is chosen once at New Game (Easy / Medium / Hard) and only changes how
  well enemies *play*. Bosses get harder by bringing more pieces, not by thinking harder.
- **Forms**: your hero looks like the best piece you own — Pawn → Knight (can leap
  low hedges) → Bishop → Rook → Queen — and gets faster each time.
- **Gates**: Grand Board portals need a piece: Knight → Desert, Bishop → Ice,
  Rook → Starlit Court, Queen → Obsidian Throne. Boss arenas open once the realm's
  sentries are beaten. Locked doors open by solving a chess puzzle; chests hold pieces.
- Progress saves automatically in the browser (localStorage).

## Realms

| Realm | Needs | Boss | Prize |
|---|---|---|---|
| The Grand Board (hub) | — | — | Sacrifice Vault pawn |
| Emerald Ranks (meadow) | — | Equus, the Horse Demigod | Knight |
| Sunscorched Diagonals (desert) | Knight | Sethra, the Sand Bishop | Bishop |
| Frostspire Keep (ice) | Bishop | Glacius, the Rook Colossus | Rook |
| The Starlit Court (stars) | Rook | Seraphine, the Mirror Queen | Queen |
| The Obsidian Throne | Queen | Morthos, the Black King (full 16) | The ending |

## Code map

```
src/
  main.ts            game flow: title → explore ↔ duels / puzzles / chests / portals
  data/realms.ts     every realm as plain data: enemies, chests, doors, portals, props
  data/puzzles.ts    door puzzles: mate in 2–3 vs. best defence (any forced line counts)
  chess/mateSolver.ts forced-mate solver (puzzle defence + data checks); runs in a worker
  data/themes.ts     per-realm colours, board skin, particles, music scale
  game/pieces.ts     piece kinds, wallet, pawn cap, hero forms and abilities
  game/army.ts       wallet → starting FEN (pawn-rank / back-rank rules)
  game/state.ts      save data (localStorage)
  chess/engine.ts    Stockfish 19 in a Web Worker + difficulty profiles
  chess/fallbackAI.ts small alpha-beta mind if Stockfish can't load
  chess/board.ts     chessground board + chess.js rules + promotion picker
  chess/battle.ts    pre-battle formation screen, the duel loop, results
  chess/puzzle.ts    puzzle locks
  world/world.ts     Three.js realm builder, hero controller, collisions, camera
  world/models.ts    procedural lathe-turned chess-piece characters and props
  world/particles.ts fireflies / sand / snow / stars / embers
  world/input.ts     keyboard, mouse, touch joystick
  ui/                HUD, dialogs, menus, formation editor
public/engine/       Stockfish 19 lite single-threaded WASM (see STOCKFISH-LICENSE.txt)
```

### Adding content

- **A new enemy**: add an entry to a realm's `enemies` in `src/data/realms.ts`
  (`army` is what they field besides their king, `reward` is what you win).
- **A new realm**: add a `RealmDef`, a theme in `themes.ts`, and a portal to it from the hub.
- **A new puzzle**: add it to `puzzles.ts` (FEN, `mateIn`, a first move as `solution`) and point a door at it.
- Run `npm run check:data` — it proves every puzzle is a forced mate in exactly `mateIn` (no shortcut) and every enemy's
  starting position is legal chess. CI runs it before every deploy.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

Dev helpers in the browser console: `__pawn.game.s` is the live save
(e.g. `__pawn.game.s.wallet.q = 1`), `__pawn.world` the 3D world.

## Ideas for next steps

- A daily puzzle from the Lichess API; mate-in-4 vaults (would need Stockfish as the solver)
- Dungeon interiors as separate scenes; rook-charge to break cracked walls; bishop dash
- Rematches with bonus rewards, a world map / fast travel between visited realms
- Enemy piece-specific taunts during the duel; captured-piece animations in 3D
- Hand-made models or textures for bosses

## Credits & licence

- Chess engine: [Stockfish](https://stockfishchess.org/) 19 via
  [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPLv3)
- Board: [chessground](https://github.com/lichess-org/chessground) (GPLv3) with the
  cburnett piece set; rules: [chess.js](https://github.com/jhlywa/chess.js) (BSD-2)
- 3D: [three.js](https://threejs.org/) (MIT)

Because it bundles GPL components, this project is released under the GPL-3.0-or-later.
