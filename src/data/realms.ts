// Every realm in the game, as plain data. Add a realm by adding an entry here
// (and a portal to it); the 3D world is built from this automatically.
//
// Coordinates are world units on the ground plane: x to the east, z to the
// south (so "north" is negative z). The hero is about 2 units tall.

import type { ModelKind, PieceKind, Wallet } from '../game/pieces.ts';
import type { ThemeId } from './themes.ts';

export type RealmId = 'hub' | 'meadow' | 'desert' | 'ice' | 'court' | 'throne';

export interface EnemyDef {
  id: string;
  name: string;
  /** Which chess piece the enemy looks like in the world. */
  kind: ModelKind;
  x: number;
  z: number;
  /** Optional waypoints the enemy walks between. */
  patrol?: [number, number][];
  /** The enemy's pieces besides its king. */
  army: Partial<Wallet>;
  /** Pieces the hero captures for winning. */
  reward: Partial<Wallet>;
  boss?: boolean;
  /** Beating this enemy wins the game. */
  final?: boolean;
  taunt: string;
  defeat: string;
}

export interface ChestDef {
  id: string;
  x: number;
  z: number;
  /** Facing in radians: 0 = front faces south (+z), PI/2 = east, -PI/2 = west. */
  rot?: number;
  reward: Partial<Wallet>;
}

export type DoorOpens = { puzzle: string } | { defeat: string[] };

export interface DoorDef {
  id: string;
  x: number;
  z: number;
  /** 0 = door spans the x axis; PI/2 = spans the z axis. */
  rot: number;
  width: number;
  height: number;
  opens: DoorOpens;
  name: string;
}

export interface PortalDef {
  id: string;
  to: RealmId;
  x: number;
  z: number;
  requires?: PieceKind;
  label: string;
}

export interface WallDef {
  x1: number; z1: number; x2: number; z2: number;
  height: number;
  style: 'stone' | 'hedge';
}

export interface SignDef { x: number; z: number; text: string }

export interface NpcDef {
  id: string;
  name: string;
  kind: ModelKind;
  x: number;
  z: number;
  lines: string[];
}

export type PropKind =
  | 'tree' | 'bush' | 'flower' | 'rock'
  | 'cactus' | 'pyramid' | 'obelisk'
  | 'pine' | 'icespire' | 'tower'
  | 'crystal' | 'statue' | 'column'
  | 'spike' | 'torch' | 'brazier';

export interface PropDef { kind: PropKind; x: number; z: number; s?: number; r?: number }
export interface ScatterDef { kind: PropKind; count: number; min?: number; max?: number }

export interface RealmDef {
  id: RealmId;
  name: string;
  subtitle: string;
  theme: ThemeId;
  /** Walkable area is the square [-half, half] on both axes. */
  half: number;
  /** yaw: facing in radians, 0 = north (toward negative z). */
  spawn: { x: number; z: number; yaw: number };
  enemies: EnemyDef[];
  chests: ChestDef[];
  doors: DoorDef[];
  portals: PortalDef[];
  walls: WallDef[];
  signs: SignDef[];
  npcs: NpcDef[];
  props: PropDef[];
  scatter: ScatterDef[];
  /** Giant chessboard floors (boss arenas, the hub plaza). */
  boards: { x: number; z: number; size: number }[];
}

// ---------------------------------------------------------------------------
// Builders

type Side = 'n' | 's' | 'e' | 'w';
const DOOR_W = 3.6;

/**
 * A rectangular walled room. With a door side, the wall on that side gets a
 * gap and the returned door fills it.
 */
function room(
  id: string,
  cx: number, cz: number, w: number, d: number,
  opts: { door?: Side; opens?: DoorOpens; name?: string; height?: number; style?: 'stone' | 'hedge' },
): { walls: WallDef[]; doors: DoorDef[] } {
  const h = opts.height ?? 3.2;
  const style = opts.style ?? 'stone';
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const wall = (a: number, b: number, c: number, e: number): WallDef => ({ x1: a, z1: b, x2: c, z2: e, height: h, style });
  const walls: WallDef[] = [];
  const doors: DoorDef[] = [];
  const g = DOOR_W / 2;
  const full: Record<Side, WallDef> = {
    n: wall(x0, z0, x1, z0), s: wall(x0, z1, x1, z1),
    w: wall(x0, z0, x0, z1), e: wall(x1, z0, x1, z1),
  };
  const split: Record<Side, WallDef[]> = {
    n: [wall(x0, z0, cx - g, z0), wall(cx + g, z0, x1, z0)],
    s: [wall(x0, z1, cx - g, z1), wall(cx + g, z1, x1, z1)],
    w: [wall(x0, z0, x0, cz - g), wall(x0, cz + g, x0, z1)],
    e: [wall(x1, z0, x1, cz - g), wall(x1, cz + g, x1, z1)],
  };
  for (const s of ['n', 's', 'w', 'e'] as Side[]) walls.push(...(opts.door === s ? split[s] : [full[s]]));
  if (opts.door && opts.opens) {
    const pos = { n: [cx, z0], s: [cx, z1], w: [x0, cz], e: [x1, cz] }[opts.door];
    doors.push({
      id, x: pos[0], z: pos[1],
      rot: opts.door === 'n' || opts.door === 's' ? 0 : Math.PI / 2,
      width: DOOR_W, height: h, opens: opts.opens, name: opts.name ?? 'Sealed Door',
    });
  }
  return { walls, doors };
}

function merge(...rooms: { walls: WallDef[]; doors: DoorDef[] }[]) {
  return { walls: rooms.flatMap((r) => r.walls), doors: rooms.flatMap((r) => r.doors) };
}

// ---------------------------------------------------------------------------
// The Grand Board — hub

const hubRooms = merge(
  room('hub_vault', 22, 22, 9, 9, { door: 'w', opens: { puzzle: 'deflection' }, name: 'The Sacrifice Vault' }),
);

const HUB: RealmDef = {
  id: 'hub',
  name: 'The Grand Board',
  subtitle: 'Crossroads of the Sixty-Four Realms',
  theme: 'hub',
  half: 38,
  spawn: { x: 0, z: 22, yaw: 0 },
  enemies: [],
  chests: [{ id: 'hub_vault_chest', x: 23.5, z: 22, rot: -Math.PI / 2, reward: { p: 1 } }],
  doors: hubRooms.doors,
  walls: hubRooms.walls,
  portals: [
    { id: 'hub_meadow', to: 'meadow', x: -18, z: -22, label: 'Emerald Ranks' },
    { id: 'hub_desert', to: 'desert', x: 18, z: -22, requires: 'n', label: 'Sunscorched Diagonals' },
    { id: 'hub_ice', to: 'ice', x: 31, z: 0, requires: 'b', label: 'Frostspire Keep' },
    { id: 'hub_court', to: 'court', x: -31, z: 0, requires: 'r', label: 'The Starlit Court' },
    { id: 'hub_throne', to: 'throne', x: 0, z: -32, requires: 'q', label: 'The Obsidian Throne' },
  ],
  signs: [
    { x: 4, z: 16, text: 'THE GRAND BOARD — Each gate is sealed by a piece. Win a Knight to pass the Desert gate, a Bishop for the Ice, a Rook for the Stars, a Queen for the Throne.' },
    { x: 16, z: 26, text: 'THE SACRIFICE VAULT — Solve the puzzle on the door and its treasure is yours. Fair warning: the door fights back.' },
  ],
  npcs: [
    {
      id: 'ferz', name: 'Old King Ferz', kind: 'k', x: -5, z: 13,
      lines: [
        'Ah, a pawn with ambition! I am Ferz, last of the White Kings. Morthos the Black King shattered our board into sixty-four realms.',
        'Every foe in these lands fights with chess. Checkmate them and you capture their pieces for your own army.',
        'You begin with three pawns and your king. Pawns always stand on your second rank — eight at most. Every other piece stands behind them.',
        'Start in the Emerald Ranks to the north-west. Beat its sentries for pawns, then face the Horse Demigod. Win his Knight and you will leap like one!',
        'Locked doors hide treasure. Solve the chess puzzle on the door to open it. Now go — the board awaits!',
      ],
    },
  ],
  props: [
    { kind: 'column', x: -12, z: -10 }, { kind: 'column', x: 12, z: -10 },
    { kind: 'column', x: -12, z: 10 }, { kind: 'column', x: 12, z: 10 },
    { kind: 'statue', x: 0, z: -4, s: 1.6 },
    { kind: 'brazier', x: -6, z: -26 }, { kind: 'brazier', x: 6, z: -26 },
    { kind: 'torch', x: -24, z: -18 }, { kind: 'torch', x: -12, z: -18 },
    { kind: 'torch', x: 12, z: -18 }, { kind: 'torch', x: 24, z: -18 },
    { kind: 'torch', x: 27, z: -5 }, { kind: 'torch', x: 27, z: 5 },
    { kind: 'torch', x: -27, z: -5 }, { kind: 'torch', x: -27, z: 5 },
  ],
  scatter: [],
  boards: [{ x: 0, z: 0, size: 48 }],
};

// ---------------------------------------------------------------------------
// Emerald Ranks — meadow. Pawn sentries, a hedge maze hall, the Horse Demigod.

const meadowRooms = merge(
  room('meadow_hall', -24, -4, 14, 12, { door: 'e', opens: { puzzle: 'philidor' }, name: 'Hedge Hall', style: 'hedge', height: 2.8 }),
  room('meadow_arena', 0, -36, 22, 16, { door: 's', opens: { defeat: ['meadow_pip', 'meadow_tobble'] }, name: 'Arena Gate' }),
  // A low hedge garden with no door at all: only a leaping Knight gets in.
  room('meadow_garden', 30, -14, 8, 8, { style: 'hedge', height: 1.0 }),
);

const MEADOW: RealmDef = {
  id: 'meadow',
  name: 'Emerald Ranks',
  subtitle: 'Where every pawn begins',
  theme: 'meadow',
  half: 50,
  spawn: { x: 0, z: 42, yaw: 0 },
  enemies: [
    {
      id: 'meadow_pip', name: 'Pip the Pawn Sentry', kind: 'p', x: -10, z: 24,
      patrol: [[-15, 24], [-4, 27]], army: { p: 1 }, reward: { p: 1 },
      taunt: 'Halt! One pawn is all I need to stop the likes of you!',
      defeat: 'Oof. Take my pawn — it was getting lonely anyway.',
    },
    {
      id: 'meadow_tobble', name: 'Tobble the Pawn Sentry', kind: 'p', x: 14, z: 10,
      patrol: [[10, 5], [19, 14]], army: { p: 2 }, reward: { p: 1 },
      taunt: 'Two pawns! Twice the pawns, twice the trouble!',
      defeat: 'The field is yours. And so is one of my pawns.',
    },
    {
      id: 'meadow_equus', name: 'Equus, the Horse Demigod', kind: 'n', x: 0, z: -39, boss: true,
      army: { n: 1, p: 3 }, reward: { n: 1 },
      taunt: 'NEIGH! None have outmanoeuvred my L-shaped fury. Kneel, little pawn!',
      defeat: 'Impossible... Take my Knight. With it, you shall LEAP.',
    },
  ],
  chests: [
    { id: 'meadow_hall_chest', x: -28, z: -4, rot: Math.PI / 2, reward: { p: 1 } },
    { id: 'meadow_garden_chest', x: 30, z: -14, reward: { n: 1 } },
  ],
  doors: meadowRooms.doors,
  walls: meadowRooms.walls,
  portals: [{ id: 'meadow_hub', to: 'hub', x: 0, z: 47, label: 'The Grand Board' }],
  signs: [
    { x: 4, z: 38, text: 'EMERALD RANKS — Pawn sentries patrol these fields. Checkmate them to win their pawns. Beat both to open the Demigod\'s arena.' },
    { x: 24, z: -8, text: 'A walled garden with no gate. Something glints inside... if only you could leap.' },
  ],
  npcs: [],
  props: [
    { kind: 'rock', x: -8, z: -24, s: 1.6 }, { kind: 'rock', x: 9, z: -24, s: 1.4 },
    { kind: 'torch', x: -3, z: -27 }, { kind: 'torch', x: 3, z: -27 },
  ],
  boards: [{ x: 0, z: -36, size: 14 }],
  scatter: [
    { kind: 'tree', count: 46 },
    { kind: 'bush', count: 24 },
    { kind: 'flower', count: 90 },
    { kind: 'rock', count: 12 },
  ],
};

// ---------------------------------------------------------------------------
// Sunscorched Diagonals — desert. Needs a Knight.

const desertRooms = merge(
  room('desert_tomb', 26, -12, 14, 12, { door: 'w', opens: { puzzle: 'boden' }, name: 'Tomb of Diagonals' }),
  room('desert_arena', 0, -38, 22, 16, { door: 's', opens: { defeat: ['desert_khepri', 'desert_imset'] }, name: 'Temple Gate' }),
);

const DESERT: RealmDef = {
  id: 'desert',
  name: 'Sunscorched Diagonals',
  subtitle: 'The bishops walk only on the slant',
  theme: 'desert',
  half: 54,
  spawn: { x: 0, z: 46, yaw: 0 },
  enemies: [
    {
      id: 'desert_khepri', name: 'Khepri, the Dune Scarab', kind: 'n', x: -16, z: 24,
      patrol: [[-22, 20], [-10, 28]], army: { n: 1, p: 2 }, reward: { p: 1 },
      taunt: 'Click-click! The sands swallow careless pawns.',
      defeat: 'Click... I burrow in defeat. A pawn for your trouble.',
    },
    {
      id: 'desert_imset', name: 'Imset the Sand Acolyte', kind: 'b', x: 18, z: 12,
      patrol: [[14, 8], [22, 16]], army: { b: 1, p: 3 }, reward: { n: 1 },
      taunt: 'My master Sethra sees all diagonals. So do I!',
      defeat: 'The slant... betrayed me. Take this Knight from the temple stables.',
    },
    {
      id: 'desert_sethra', name: 'Sethra, the Sand Bishop', kind: 'b', x: 0, z: -41, boss: true,
      army: { b: 2, n: 1, p: 4 }, reward: { b: 1 },
      taunt: 'I have walked the diagonals for a thousand years. Your straight little path ends here.',
      defeat: 'The sands... shift. My Bishop is yours. The frozen keep will open to you now.',
    },
  ],
  chests: [{ id: 'desert_tomb_chest', x: 30, z: -12, rot: -Math.PI / 2, reward: { b: 1 } }],
  doors: desertRooms.doors,
  walls: desertRooms.walls,
  portals: [{ id: 'desert_hub', to: 'hub', x: 0, z: 51, label: 'The Grand Board' }],
  signs: [{ x: 4, z: 42, text: 'SUNSCORCHED DIAGONALS — Sethra\'s temple lies north. Her two servants hold the gate seal.' }],
  npcs: [],
  props: [
    { kind: 'pyramid', x: -36, z: -22, s: 1.6 }, { kind: 'pyramid', x: 38, z: 26, s: 1.3 },
    { kind: 'pyramid', x: -40, z: 30, s: 1.1 },
    { kind: 'obelisk', x: -6, z: -27 }, { kind: 'obelisk', x: 6, z: -27 },
    { kind: 'obelisk', x: -12, z: 0 }, { kind: 'obelisk', x: 12, z: 0 },
    { kind: 'obelisk', x: -20, z: -12 }, { kind: 'obelisk', x: 20, z: 12 },
  ],
  boards: [{ x: 0, z: -38, size: 14 }],
  scatter: [
    { kind: 'cactus', count: 38 },
    { kind: 'rock', count: 20 },
  ],
};

// ---------------------------------------------------------------------------
// Frostspire Keep — ice. Needs a Bishop.

const iceRooms = merge(
  room('ice_vault', -26, -10, 12, 12, { door: 'e', opens: { puzzle: 'lolli' }, name: 'The Frozen Corridor' }),
  room('ice_arena', 0, -38, 22, 16, { door: 's', opens: { defeat: ['ice_brisk', 'ice_vesk'] }, name: 'Keep Gate' }),
);

const ICE: RealmDef = {
  id: 'ice',
  name: 'Frostspire Keep',
  subtitle: 'Towers of ice, walls of rook',
  theme: 'ice',
  half: 54,
  spawn: { x: 0, z: 46, yaw: 0 },
  enemies: [
    {
      id: 'ice_brisk', name: 'Brisk the Frost Warden', kind: 'r', x: -18, z: 24,
      patrol: [[-24, 22], [-12, 26]], army: { r: 1, p: 3 }, reward: { p: 1 },
      taunt: 'None pass the keep while a Warden stands. And I stand firmly.',
      defeat: 'Melted... Take a pawn, and wear a scarf.',
    },
    {
      id: 'ice_vesk', name: 'Vesk the Rime Knight', kind: 'n', x: 20, z: 12,
      patrol: [[15, 8], [25, 16]], army: { n: 2, p: 3 }, reward: { n: 1 },
      taunt: 'Two frozen steeds, one cold heart. Face me!',
      defeat: 'My steed is yours. It is... a little icy.',
    },
    {
      id: 'ice_glacius', name: 'Glacius, the Rook Colossus', kind: 'r', x: 0, z: -41, boss: true,
      army: { r: 2, b: 1, n: 1, p: 5 }, reward: { r: 1 },
      taunt: 'I AM THE WALL. I AM THE FILE. I AM THE RANK. YOU. SHALL. NOT. CASTLE.',
      defeat: 'THE WALL... CRUMBLES. TAKE MY ROOK. THE STARS AWAIT YOU.',
    },
  ],
  chests: [{ id: 'ice_vault_chest', x: -30, z: -10, rot: Math.PI / 2, reward: { r: 1 } }],
  doors: iceRooms.doors,
  walls: iceRooms.walls,
  portals: [{ id: 'ice_hub', to: 'hub', x: 0, z: 51, label: 'The Grand Board' }],
  signs: [{ x: 4, z: 42, text: 'FROSTSPIRE KEEP — The Colossus sleeps in the keep to the north. Its wardens hold the gate.' }],
  npcs: [],
  props: [
    { kind: 'tower', x: -14, z: -30, s: 1.3 }, { kind: 'tower', x: 14, z: -30, s: 1.3 },
    { kind: 'tower', x: -40, z: 10 }, { kind: 'tower', x: 40, z: -10 },
    { kind: 'tower', x: 38, z: 34, s: 0.9 },
  ],
  boards: [{ x: 0, z: -38, size: 14 }],
  scatter: [
    { kind: 'pine', count: 48 },
    { kind: 'icespire', count: 26 },
    { kind: 'rock', count: 10 },
  ],
};

// ---------------------------------------------------------------------------
// The Starlit Court — court. Needs a Rook.

const courtRooms = merge(
  room('court_hall', 26, -12, 12, 12, { door: 'w', opens: { puzzle: 'anastasia' }, name: "Scholar's Door" }),
  room('court_mirror', -28, -14, 10, 10, { door: 'e', opens: { puzzle: 'pillsbury' }, name: 'The Mirror Vault' }),
  room('court_arena', 0, -38, 22, 16, { door: 's', opens: { defeat: ['court_veil', 'court_astra'] }, name: 'Throne of Stars' }),
);

const COURT: RealmDef = {
  id: 'court',
  name: 'The Starlit Court',
  subtitle: 'Where queens are crowned among the stars',
  theme: 'court',
  half: 54,
  spawn: { x: 0, z: 46, yaw: 0 },
  enemies: [
    {
      id: 'court_veil', name: 'The Knight of the Veil', kind: 'n', x: -18, z: 24,
      patrol: [[-24, 20], [-12, 28]], army: { n: 2, b: 1, p: 4 }, reward: { b: 1 },
      taunt: 'You will not see my forks coming. No one ever does.',
      defeat: 'The veil lifts. My bishop will serve you better than he served me.',
    },
    {
      id: 'court_astra', name: 'Astra, the Star Bishop', kind: 'b', x: 18, z: 12,
      patrol: [[14, 6], [24, 16]], army: { b: 2, r: 1, p: 4 }, reward: { r: 1 },
      taunt: 'The stars have already written this game. You lose in thirty-one.',
      defeat: 'The stars... miscounted. Take my Rook.',
    },
    {
      id: 'court_seraphine', name: 'Seraphine, the Mirror Queen', kind: 'q', x: 0, z: -41, boss: true,
      army: { q: 1, r: 2, b: 1, n: 1, p: 6 }, reward: { q: 1 },
      taunt: 'Every move you make, I reflect. Every threat, I return. Come, look into the mirror.',
      defeat: 'You... are no reflection. Take my Queen. Only the Black King remains.',
    },
  ],
  chests: [
    { id: 'court_hall_chest', x: 29, z: -12, rot: -Math.PI / 2, reward: { r: 1 } },
    { id: 'court_mirror_chest', x: -31, z: -14, rot: Math.PI / 2, reward: { q: 1 } },
  ],
  doors: courtRooms.doors,
  walls: courtRooms.walls,
  portals: [{ id: 'court_hub', to: 'hub', x: 0, z: 51, label: 'The Grand Board' }],
  signs: [{ x: 4, z: 42, text: 'THE STARLIT COURT — Seraphine reigns from the Throne of Stars. Legends say a second queen sleeps in the Mirror Vault.' }],
  npcs: [],
  props: [
    { kind: 'statue', x: -8, z: -26, s: 1.2 }, { kind: 'statue', x: 8, z: -26, s: 1.2 },
    { kind: 'column', x: -8, z: 0 }, { kind: 'column', x: 8, z: 0 },
    { kind: 'column', x: -8, z: 14 }, { kind: 'column', x: 8, z: 14 },
    { kind: 'column', x: -8, z: 28 }, { kind: 'column', x: 8, z: 28 },
  ],
  boards: [{ x: 0, z: -38, size: 14 }],
  scatter: [
    { kind: 'crystal', count: 34 },
    { kind: 'flower', count: 50 },
    { kind: 'rock', count: 8 },
  ],
};

// ---------------------------------------------------------------------------
// The Obsidian Throne — final realm. Needs a Queen.

const throneRooms = merge(
  room('throne_vault', 24, -4, 12, 12, { door: 'w', opens: { puzzle: 'damiano' }, name: 'The Black Vault' }),
  room('throne_arena', 0, -30, 26, 18, { door: 's', opens: { defeat: ['throne_warden', 'throne_ashen'] }, name: 'The Black Gate' }),
);

const THRONE: RealmDef = {
  id: 'throne',
  name: 'The Obsidian Throne',
  subtitle: 'The full board. The final game.',
  theme: 'throne',
  half: 48,
  spawn: { x: 0, z: 40, yaw: 0 },
  enemies: [
    {
      id: 'throne_warden', name: 'The Obsidian Warden', kind: 'r', x: -14, z: 18,
      patrol: [[-20, 16], [-8, 22]], army: { r: 2, b: 1, n: 1, p: 6 }, reward: { p: 1 },
      taunt: 'The Black King sees you through my eyes. Turn back.',
      defeat: 'The King... will be displeased.',
    },
    {
      id: 'throne_ashen', name: 'The Ashen Knight', kind: 'n', x: 14, z: 18,
      patrol: [[8, 14], [20, 22]], army: { q: 1, n: 2, b: 1, p: 6 }, reward: { n: 1 },
      taunt: 'I burned the old White Court. You are kindling.',
      defeat: 'Ash to ash... my steed rides for you now.',
    },
    {
      id: 'throne_morthos', name: 'Morthos, the Black King', kind: 'k', x: 0, z: -33, boss: true, final: true,
      army: { q: 1, r: 2, b: 2, n: 2, p: 8 }, reward: {},
      taunt: 'So. The pawn who would be king. I command every piece on the board. You command... whatever you scavenged. Let us play.',
      defeat: 'Checkmate... by a pawn. The board... is whole again.',
    },
  ],
  chests: [{ id: 'throne_vault_chest', x: 27, z: -4, rot: -Math.PI / 2, reward: { b: 1 } }],
  doors: throneRooms.doors,
  walls: throneRooms.walls,
  portals: [{ id: 'throne_hub', to: 'hub', x: 0, z: 45, label: 'The Grand Board' }],
  signs: [{ x: 4, z: 36, text: 'THE OBSIDIAN THRONE — Morthos waits behind the Black Gate with a full army of sixteen.' }],
  npcs: [],
  props: [
    { kind: 'brazier', x: -6, z: -19 }, { kind: 'brazier', x: 6, z: -19 },
    { kind: 'statue', x: -12, z: 4, s: 1.3 }, { kind: 'statue', x: 12, z: 4, s: 1.3 },
    { kind: 'torch', x: -4, z: 30 }, { kind: 'torch', x: 4, z: 30 },
    { kind: 'torch', x: -4, z: 10 }, { kind: 'torch', x: 4, z: 10 },
  ],
  boards: [{ x: 0, z: -30, size: 16 }],
  scatter: [
    { kind: 'spike', count: 40 },
    { kind: 'rock', count: 16 },
  ],
};

export const REALMS: Record<RealmId, RealmDef> = {
  hub: HUB, meadow: MEADOW, desert: DESERT, ice: ICE, court: COURT, throne: THRONE,
};

export function findEnemy(id: string): { realm: RealmDef; enemy: EnemyDef } | null {
  for (const realm of Object.values(REALMS)) {
    const enemy = realm.enemies.find((e) => e.id === id);
    if (enemy) return { realm, enemy };
  }
  return null;
}
