// Sanity checks for the game data. Run: npm run check:data
// (Node 22.6+ loads the .ts data files directly by stripping their types.)
//
//  * every puzzle is a legal position with at least one mate in one
//  * every enemy's starting position is legal chess against the starting army
//  * doors, portals and ids all point at things that exist
import { Chess } from 'chess.js';
import { PUZZLES } from '../src/data/puzzles.ts';
import { REALMS } from '../src/data/realms.ts';
import { autoArrange, buildFen } from '../src/game/army.ts';
import { STARTING_WALLET } from '../src/game/pieces.ts';

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
  const mates = game.moves({ verbose: true }).filter((m) => {
    const g = new Chess(p.fen);
    g.move(m);
    return g.isCheckmate();
  });
  if (game.turn() !== 'w' || mates.length === 0) fail(`${p.id}: no mate in one for white`);
  else console.log(`✓ puzzle ${p.id}: ${mates.map((m) => m.san).join(', ')}`);
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
