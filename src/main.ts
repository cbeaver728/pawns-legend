// Game flow: title → explore ↔ duels, puzzles, chests and portals.

import './style.css';
import { playMusic, setSound, sfx, stopMusic, unlockAudio } from './audio/sound.ts';
import { runBattle } from './chess/battle.ts';
import { chessMind } from './chess/engine.ts';
import { runPuzzle } from './chess/puzzle.ts';
import { PUZZLES } from './data/puzzles.ts';
import { REALMS, type PortalDef, type RealmId } from './data/realms.ts';
import { THEMES } from './data/themes.ts';
import { addToWallet, currentForm, describePieces, PIECE_NAMES, type Wallet } from './game/pieces.ts';
import { game, loadSave, newSave } from './game/state.ts';
import { fadeThrough } from './ui/dom.ts';
import { Hud, say, showReward } from './ui/hud.ts';
import { endingScreen, pauseMenu, titleScreen } from './ui/menus.ts';
import { World, type Interactable } from './world/world.ts';

const world = new World(document.getElementById('scene')!, document.getElementById('controls')!);
const hud = new Hud(document.getElementById('ui')!);
let busy = false;

// Handy for debugging from the console: window.__pawn.game.s.wallet.q = 1
(window as unknown as { __pawn: unknown }).__pawn = { world, game, hud };

function refreshHud() {
  hud.setRealm(world.realm.name, currentForm(game.s.wallet));
  hud.setWallet(game.s.wallet);
}

function enterPlay() {
  world.setMode('play');
  world.setRendering(true);
  hud.show(true);
  playMusic(world.theme);
}

/** Brings the 3D world back on screen after a duel or puzzle. */
function showWorld() {
  document.getElementById('scene')!.style.visibility = '';
  world.setRendering(true);
}

/** Runs something modal (dialog, duel, menu) with the world frozen underneath. */
async function modal(fn: () => Promise<void>, opts: { hideWorld?: boolean } = {}) {
  if (busy) return;
  busy = true;
  world.setMode('frozen');
  hud.show(false);
  const scene = document.getElementById('scene')!;
  if (opts.hideWorld) {
    world.setRendering(false);
    scene.style.visibility = 'hidden';
  }
  try {
    await fn();
  } finally {
    scene.style.visibility = '';
    busy = false;
    if (world.mode === 'frozen') enterPlay();
    refreshHud();
    savePosition();
  }
}

function savePosition() {
  if (!game.save) return;
  game.s.realm = world.realm.id;
  game.s.pos = world.heroPosition;
  game.persist();
}
setInterval(() => { if (world.mode === 'play') savePosition(); }, 4000);
addEventListener('pagehide', savePosition);

/** Adds pieces and shows the treasure card, plus a form change if it happened. */
async function grant(title: string, reward: Partial<Wallet>, from?: string) {
  const s = game.s;
  const before = currentForm(s.wallet);
  const got = addToWallet(s.wallet, reward);
  game.persist();
  const lostPawns = (reward.p ?? 0) - (got.p ?? 0);
  const extra = [
    from,
    lostPawns > 0 ? 'Your pawn rank is already full (8), so the extra pawn returns home.' : '',
  ].filter(Boolean).join(' ');
  if (Object.keys(got).length || extra) await showReward(title, got, extra || undefined);
  const after = currentForm(s.wallet);
  if (after.kind !== before.kind) {
    world.refreshHero();
    world.celebrate();
    sfx('win');
    await showReward(`You became the ${after.title}!`, {},
      after.kind === 'n' ? 'You can now LEAP over low hedges — press Space (or B on a phone). The Desert gate on the Grand Board will open for you.'
      : after.kind === 'b' ? 'You move faster than ever. The Ice gate on the Grand Board will open for you.'
      : after.kind === 'r' ? 'Sturdy and swift. The Starlit Court gate will open for you.'
      : 'The most powerful piece on the board. The Obsidian Throne awaits.', after.kind);
  }
  refreshHud();
}

async function interact(t: Interactable) {
  unlockAudio();
  const s = game.s;
  switch (t.type) {
    case 'sign':
      return modal(() => say('Sign', [t.def.text]));
    case 'npc':
      return modal(() => say(t.def.name, t.def.lines));
    case 'chest':
      return modal(async () => {
        if (s.opened.includes(t.def.id)) return;
        s.opened.push(t.def.id);
        game.persist();
        await world.openChest(t.def.id);
        await grant(`You found ${describePieces(t.def.reward)}!`, t.def.reward);
      });
    case 'door': {
      const opens = t.def.opens;
      if ('defeat' in opens) {
        const left = opens.defeat.filter((id) => !s.defeated.includes(id))
          .map((id) => world.realm.enemies.find((e) => e.id === id)?.name.split(',')[0] ?? id);
        sfx('locked');
        return modal(() => say(t.def.name, [`A seal holds this gate shut. It will break when you have defeated: ${left.join(' and ')}.`]));
      }
      const puzzle = PUZZLES[opens.puzzle];
      return modal(async () => {
        await say(t.def.name, ['A chessboard is carved into the door. Solve it to open the lock.']);
        const ok = await runPuzzle(puzzle, world.theme, t.def.name);
        if (ok) {
          s.solved.push(t.def.id);
          game.persist();
          showWorld();
          world.refreshDoors();
          hud.toast(`${t.def.name} opens!`);
        }
      }, { hideWorld: true });
    }
    case 'enemy':
      return modal(async () => {
        const result = await runBattle(t.def, world.theme);
        showWorld();
        playMusic(world.theme);
        if (result === 'win') {
          s.defeated.push(t.def.id);
          game.persist();
          world.petrify(t.def.id);
          if (Object.keys(t.def.reward).length) {
            await grant(`You captured ${describePieces(t.def.reward)}!`, t.def.reward, `${t.def.name.split(',')[0]} is defeated.`);
          }
          if (world.refreshDoors()) hud.toast('Somewhere, a sealed gate crumbles…', 3200);
          if (t.def.final) await endingScreen();
        } else {
          world.stepBackFrom(t.def.id);
          if (result === 'fled') hud.toast('You slip away… for now.');
        }
      }, { hideWorld: true });
  }
}

async function travel(p: PortalDef) {
  const s = game.s;
  if (p.requires && s.wallet[p.requires] === 0) {
    sfx('locked');
    hud.toast(`The gate is sealed. You need a ${PIECE_NAMES[p.requires]} to pass.`, 3000);
    return;
  }
  if (busy) return;
  busy = true;
  sfx('portal');
  world.setMode('frozen');
  const from = world.realm.id;
  await fadeThrough(() => {
    world.load(p.to, { from });
    if (!s.visited.includes(p.to)) s.visited.push(p.to);
    savePosition();
    refreshHud();
  });
  busy = false;
  enterPlay();
  void hud.banner(REALMS[p.to].name, REALMS[p.to].subtitle);
}

world.events = {
  interact: (t) => void interact(t),
  portal: (p) => void travel(p),
  menu: () => void openMenu(),
  prompt: (text) => hud.setPrompt(text),
};
hud.onMenu = () => void openMenu();
// Tapping the prompt is the same as pressing A.
hud.onPromptTap = () => world.input.pressAction();

async function openMenu() {
  if (busy || world.mode !== 'play') return;
  let quit = false;
  await modal(async () => {
    quit = (await pauseMenu(world.realm.name)) === 'quit';
  });
  if (quit) await toTitle();
}

async function toTitle() {
  savePosition();
  world.setMode('title');
  hud.show(false);
  await fadeThrough(() => world.load('hub'));
  stopMusic();
  playMusic(THEMES.hub);
  const choice = await titleScreen(loadSave());
  await start(choice.kind === 'new' ? newSave(choice.difficulty) : loadSave()!);
}

async function start(save: ReturnType<typeof newSave>) {
  const isNew = save.stats.wins === 0 && save.opened.length === 0 && !save.pos;
  game.save = save;
  game.persist();
  setSound(save.settings);
  await fadeThrough(() => {
    world.load((save.realm as RealmId) in REALMS ? (save.realm as RealmId) : 'hub', { pos: save.pos });
    world.setMode('frozen');
    refreshHud();
  });
  if (isNew) {
    await modal(() => say('Old King Ferz', [
      'Long ago, the Black King Morthos shattered the Great Board into sixty-four realms and scattered its pieces.',
      'You are only a pawn. But every pawn that reaches the far side of the board can become something greater...',
      'Find me near the centre of the Grand Board and I will tell you more. Walk with WASD, the arrow keys, or the left side of your screen.',
    ]));
  }
  enterPlay();
  void hud.banner(world.realm.name, world.realm.subtitle);
}

// Boot: show the hub behind the title screen.
hud.show(false);
world.load('hub');
world.setMode('title');
void chessMind.warmUp();
document.getElementById('boot')?.remove();
addEventListener('pointerdown', () => { unlockAudio(); playMusic(THEMES.hub); }, { once: true });
titleScreen(loadSave()).then((choice) => start(choice.kind === 'new' ? newSave(choice.difficulty) : loadSave()!));
