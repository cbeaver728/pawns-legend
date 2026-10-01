// Sanity checks for the game data. Run: npm run check:data
// (Node 22.6+ loads the .ts data files directly by stripping their types.)
//
//  * every puzzle forces mate in exactly mateIn moves (never fewer), and its
//    listed solution really starts such a mate
//  * every enemy's starting position is legal chess against the starting army
//  * doors, portals and ids all point at things that exist
import { Chess } from 'chess.js';
import { PUZZLES } from '../src/data/puzzles.ts';
import { REALMS } from '../src/data/realms.ts';
import { autoArrange, buildFen } from '../src/game/army.ts';
import { STARTING_WALLET } from '../src/game/pieces.ts';
import { everyReplyLoses, mateLength } from '../src/chess/mateSolver.ts';

let failed = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failed++; };

for (const p of Object.values(PUZZLES)) {
  let game;
  try {
    game = new Chess(p.fen);
  } catch (e) {
    fail(`${p.id}: bad FEN — ${e.message}`);
    continue;
  }
  if (game.turn() !== 'w') { fail(`${p.id}: white must be to move`); continue; }
  const len = mateLength(game, p.mateIn);
  if (len !== p.mateIn) {
    fail(`${p.id}: forced mate in ${len ?? `more than ${p.mateIn}`}, but labelled mate in ${p.mateIn}`);
    continue;
  }
  let starts = false;
  try {
    game.move(p.solution);
    starts = p.mateIn === 1 ? game.isCheckmate() : everyReplyLoses(game, p.mateIn - 1);
    game.undo();
  } catch { /* illegal solution move */ }
  if (!starts) fail(`${p.id}: listed solution ${p.solution} does not force mate in ${p.mateIn}`);
  else console.log(`✓ puzzle ${p.id}: mate in ${p.mateIn}, starts ${p.solution}`);
}

const hero = autoArrange(STARTING_WALLET);
const enemyIds = new Set(Object.values(REALMS).flatMap((r) => r.enemies.map((e) => e.id)));
const ids = new Set();
for (const realm of Object.values(REALMS)) {
  for (const e of realm.enemies) {
    const fen = buildFen(hero, autoArrange(e.army));
    try {
      new Chess(fen);
      console.log(`✓ enemy ${e.id}: ${fen.split(' ')[0]}`);
    } catch (err) {
      fail(`${e.id}: ${err.message} (${fen})`);
    }
  }
  for (const d of realm.doors) {
    const bad = 'puzzle' in d.opens
      ? !PUZZLES[d.opens.puzzle]
      : d.opens.defeat.some((id) => !enemyIds.has(id));
    if (bad) fail(`door ${d.id} opens on something that does not exist`);
  }
  for (const p of realm.portals) if (!REALMS[p.to]) fail(`portal ${p.id} leads to unknown realm ${p.to}`);
  for (const thing of [...realm.enemies, ...realm.chests, ...realm.doors, ...realm.portals]) {
    if (ids.has(thing.id)) fail(`duplicate id ${thing.id}`);
    ids.add(thing.id);
  }
}
process.exit(failed ? 1 : 0);
