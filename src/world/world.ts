// The explorable 3D world: renders a realm from its data, moves the hero,
// handles collisions, the follow camera, and tells the game when the hero
// wants to interact with something.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx } from '../audio/sound.ts';
import {
  REALMS, type ChestDef, type DoorDef, type EnemyDef, type NpcDef, type PortalDef,
  type RealmDef, type RealmId, type SignDef,
} from '../data/realms.ts';
import { THEMES, type Theme } from '../data/themes.ts';
import { currentForm, PIECE_NAMES, type Form, type ModelKind } from '../game/pieces.ts';
import { game } from '../game/state.ts';
import { Input } from './input.ts';
import {
  enemyLook, heroLook, makeMaterials, mergeParts, pieceModel, placeParts, PROP_RADIUS, propParts, stoneLook, textSprite,
  type MatKey,
} from './models.ts';
import { Particles } from './particles.ts';

export type Interactable =
  | { type: 'enemy'; def: EnemyDef }
  | { type: 'chest'; def: ChestDef }
  | { type: 'door'; def: DoorDef }
  | { type: 'sign'; def: SignDef }
  | { type: 'npc'; def: NpcDef };

export interface WorldEvents {
  interact(t: Interactable): void;
  portal(p: PortalDef): void;
  menu(): void;
  prompt(text: string | null): void;
}

interface Circle { x: number; z: number; r: number; h: number }
interface Box { minX: number; maxX: number; minZ: number; maxZ: number; h: number; id?: string }

interface EnemyEnt {
  def: EnemyDef;
  group: THREE.Group;
  model: THREE.Group;
  label: THREE.Sprite;
  alert: THREE.Sprite;
  scale: number;
  pos: THREE.Vector3;
  home: THREE.Vector3;
  wp: number;
  pause: number;
  defeated: boolean;
  noticed: boolean;
  collider: Circle;
}

interface DoorEnt { def: DoorDef; group: THREE.Group; box: Box; opening: number; open: boolean }
interface ChestEnt { def: ChestDef; group: THREE.Group; lid: THREE.Object3D; opened: boolean }
interface PortalEnt { def: PortalDef; group: THREE.Group; disc: THREE.Mesh; icon?: THREE.Object3D; unlocked: boolean }
interface NpcEnt { def: NpcDef; group: THREE.Group }

const GRAVITY = 24;
const HERO_R = 0.5;
const tmpV = new THREE.Vector3();

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hash2(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise in [0,1]. */
function noise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  events: WorldEvents | null = null;

  realm!: RealmDef;
  theme!: Theme;
  mode: 'title' | 'play' | 'frozen' = 'title';

  private realmGroup = new THREE.Group();
  private sky: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private particles: Particles | null = null;

  private hero = new THREE.Group();
  private heroModel: THREE.Group | null = null;
  private heroKind: ModelKind | null = null;
  private form: Form = currentForm({ p: 3, n: 0, b: 0, r: 0, q: 0 });
  private heroPos = new THREE.Vector3();
  private heroVel = new THREE.Vector3();
  private heroYaw = 0;
  private heroY = 0;
  private heroVy = 0;
  private walkPhase = 0;

  private camYaw = 0;
  private camDist = 10;
  private manualCamTimer = 0;

  private circles: Circle[] = [];
  private boxes: Box[] = [];
  private enemies: EnemyEnt[] = [];
  private doors: DoorEnt[] = [];
  private chests: ChestEnt[] = [];
  private portals: PortalEnt[] = [];
  private npcs: NpcEnt[] = [];
  private signs: SignDef[] = [];
  private portalArmed = false;
  private animated: ((t: number, dt: number) => void)[] = [];
  private lastPrompt: string | null = null;
  private current: Interactable | null = null;
  private clock = new THREE.Clock();
  private time = 0;
  private rendering = true;

  constructor(canvasHost: HTMLElement, controls: HTMLElement) {
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    canvasHost.append(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
    this.input = new Input(this.renderer.domElement, controls);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
          void main() {
            float h = smoothstep(-0.08, 0.55, vP.y);
            gl_FragColor = vec4(mix(bottom, top, h), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.realmGroup);
    this.scene.add(this.hero);

    const resize = () => {
      const w = canvasHost.clientWidth || innerWidth;
      const h = canvasHost.clientHeight || innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      // Pull back a little on tall phone screens so more of the world fits.
      this.camera.fov = w < h ? 68 : 55;
      this.camDist = w < h ? 11.5 : 10;
      this.camera.updateProjectionMatrix();
    };
    addEventListener('resize', resize);
    resize();

    this.renderer.setAnimationLoop(() => this.frame());
  }

  // -------------------------------------------------------------------------
  // Loading realms

  /** Builds a realm. `from` places the hero at the portal leading back there. */
  load(id: RealmId, spawn?: { from?: RealmId; pos?: { x: number; z: number } | null }) {
    this.unload();
    const realm = REALMS[id];
    this.realm = realm;
    this.theme = THEMES[realm.theme];
    const t = this.theme;

    (this.sky.material as THREE.ShaderMaterial).uniforms.top.value.setHex(t.skyTop);
    (this.sky.material as THREE.ShaderMaterial).uniforms.bottom.value.setHex(t.skyBottom);
    this.scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar);
    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.sun.color.setHex(t.sun);
    this.sun.intensity = t.sunIntensity;

    const mats = makeMaterials(t.accent);
    const rand = seeded([...realm.id].reduce((s, c) => s * 33 + c.charCodeAt(0), 5381));

    if (realm.id === 'hub') this.buildSkyPlatform(realm, t);
    else this.buildGround(realm, t);
    for (const b of realm.boards) this.buildBoard(b.x, b.z, b.size, t);
    this.buildWalls(realm, t, mats);

    // Hand-placed props, then random scatter that avoids everything important.
    const parts = [];
    for (const p of realm.props) {
      const s = p.s ?? 1;
      parts.push(...placeParts(propParts(p.kind, rand), p.x, p.z, s, p.r ?? rand() * Math.PI * 2));
      const r = PROP_RADIUS[p.kind];
      if (r) this.circles.push({ x: p.x, z: p.z, r: r * s, h: 99 });
    }
    const keepClear = this.clearZones(realm);
    for (const sc of realm.scatter) {
      let placed = 0;
      for (let tries = 0; placed < sc.count && tries < sc.count * 30; tries++) {
        const x = (rand() * 2 - 1) * (realm.half - 2);
        const z = (rand() * 2 - 1) * (realm.half - 2);
        const s = (sc.min ?? 0.8) + rand() * ((sc.max ?? 1.3) - (sc.min ?? 0.8));
        const r = (PROP_RADIUS[sc.kind] ?? 0.3) * s;
        if (keepClear.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r)) continue;
        if (this.boxes.some((b) => x > b.minX - r - 1 && x < b.maxX + r + 1 && z > b.minZ - r - 1 && z < b.maxZ + r + 1)) continue;
        if (this.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r + 0.4)) continue;
        parts.push(...placeParts(propParts(sc.kind, rand), x, z, s, rand() * Math.PI * 2));
        if (PROP_RADIUS[sc.kind] && sc.kind !== 'flower') this.circles.push({ x, z, r, h: 99 });
        placed++;
      }
    }
    // Scenery just outside the walkable area so the edges feel like a place, not a wall.
    const edgeKinds = realm.scatter.filter((s) => s.kind !== 'flower').map((s) => s.kind);
    if (edgeKinds.length) {
      for (let i = 0; i < 70; i++) {
        const a = rand() * Math.PI * 2;
        const d = realm.half + 3 + rand() * 18;
        const x = Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * d;
        const z = Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * d;
        const k = edgeKinds[Math.floor(rand() * edgeKinds.length)];
        parts.push(...placeParts(propParts(k, rand), x, z, 1 + rand() * 0.8, rand() * 6));
      }
    }
    this.realmGroup.add(mergeParts(parts, mats));

    for (const d of realm.doors) this.buildDoor(d, t);
    for (const c of realm.chests) this.buildChest(c);
    for (const p of realm.portals) this.buildPortal(p);
    for (const s of realm.signs) this.buildSign(s);
    for (const n of realm.npcs) this.buildNpc(n);
    for (const e of realm.enemies) this.buildEnemy(e, t);

    this.particles = new Particles(t.particles, t.accent);
    this.realmGroup.add(this.particles.points);

    // Where does the hero appear?
    // Realm data says 0 = facing north; models face +z (south), hence the half turn.
    let sx = realm.spawn.x, sz = realm.spawn.z, yaw = realm.spawn.yaw + Math.PI;
    const back = spawn?.from ? realm.portals.find((p) => p.to === spawn.from) : undefined;
    if (back) {
      const toC = Math.atan2(-back.x, -back.z);
      // Far enough out that the follow camera sits in front of the arch, not inside it.
      sx = back.x + Math.sin(toC) * 12;
      sz = back.z + Math.cos(toC) * 12;
      yaw = toC;
    } else if (spawn?.pos) {
      sx = spawn.pos.x;
      sz = spawn.pos.z;
    }
    this.heroPos.set(sx, 0, sz);
    this.heroY = 0;
    this.heroVy = 0;
    this.heroVel.set(0, 0, 0);
    this.heroYaw = yaw;
    this.camYaw = yaw + Math.PI;
    this.portalArmed = false;
    this.refreshHero();
    this.resolveCollisions();
  }

  private unload() {
    this.realmGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) {
        (x as THREE.MeshStandardMaterial).map?.dispose();
        x.dispose();
      }
    });
    this.realmGroup.clear();
    this.circles = [];
    this.boxes = [];
    this.enemies = [];
    this.doors = [];
    this.chests = [];
    this.portals = [];
    this.npcs = [];
    this.signs = [];
    this.animated = [];
    this.particles = null;
    this.current = null;
  }

  private clearZones(realm: RealmDef): { x: number; z: number; r: number }[] {
    const z: { x: number; z: number; r: number }[] = [
      { x: realm.spawn.x, z: realm.spawn.z, r: 7 },
      { x: 0, z: 0, r: 4 },
    ];
    for (const e of realm.enemies) {
      z.push({ x: e.x, z: e.z, r: e.boss ? 9 : 5 });
      for (const w of e.patrol ?? []) z.push({ x: w[0], z: w[1], r: 4 });
    }
    for (const p of realm.portals) z.push({ x: p.x, z: p.z, r: 7 });
    for (const c of realm.chests) z.push({ x: c.x, z: c.z, r: 2.5 });
    for (const s of realm.signs) z.push({ x: s.x, z: s.z, r: 2.5 });
    for (const n of realm.npcs) z.push({ x: n.x, z: n.z, r: 3 });
    for (const b of realm.boards) z.push({ x: b.x, z: b.z, r: b.size * 0.75 });
    for (const d of realm.doors) z.push({ x: d.x, z: d.z, r: 5 });
    // Keep a clear avenue up the middle from the entrance to the boss.
    for (let i = -realm.half; i < realm.half; i += 4) z.push({ x: 0, z: i, r: 4 });
    return z;
  }

  private buildGround(realm: RealmDef, t: Theme) {
    const size = realm.half * 2 + 170;
    const seg = 110;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(t.ground), cB = new THREE.Color(t.groundAlt), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const edge = Math.max(Math.abs(x), Math.abs(z)) - (realm.half + 4);
      let y = -0.02;
      if (edge > 0) y = Math.pow(Math.min(edge, 45), 1.15) * 0.16 + noise(x * 0.08, z * 0.08) * Math.min(edge, 30) * 0.3;
      pos.setY(i, y);
      const n = noise(x * 0.06, z * 0.06) * 0.7 + noise(x * 0.3, z * 0.3) * 0.3;
      c.copy(cA).lerp(cB, n);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    ground.receiveShadow = true;
    this.realmGroup.add(ground);
  }

  /** The hub is a marble board floating among the clouds. */
  private buildSkyPlatform(realm: RealmDef, t: Theme) {
    const size = realm.half * 2 + 2;
    const slab = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.72, size * 0.5, 4, 8, 1),
      new THREE.MeshStandardMaterial({ color: t.ground, roughness: 0.5 }),
    );
    slab.rotation.y = Math.PI / 8;
    slab.position.y = -2.02;
    slab.receiveShadow = true;
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.72 + 0.4, size * 0.72 + 0.4, 0.5, 8, 1),
      new THREE.MeshStandardMaterial({ color: t.wallTrim, roughness: 0.3, metalness: 0.7 }),
    );
    rim.rotation.y = Math.PI / 8;
    rim.position.y = -0.3;
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.72, size * 0.72, 0.1, 8, 1),
      new THREE.MeshStandardMaterial({ color: t.ground, roughness: 0.45 }),
    );
    top.rotation.y = Math.PI / 8;
    top.position.y = -0.03;
    top.receiveShadow = true;
    this.realmGroup.add(slab, rim, top);
    // Soft clouds drifting below and around.
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
    const rand = seeded(99);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const d = size * 0.8 + rand() * 60;
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + rand() * 5, 1), cloudMat);
        puff.position.set(j * 5 - 8, rand() * 2, rand() * 4);
        puff.scale.y = 0.55;
        cloud.add(puff);
      }
      cloud.position.set(Math.cos(a) * d, -14 + rand() * 12, Math.sin(a) * d);
      cloud.rotation.y = -a;
      this.realmGroup.add(cloud);
      const speed = 0.02 + rand() * 0.03;
      this.animated.push((time) => { cloud.position.x = Math.cos(a + time * speed) * d; cloud.position.z = Math.sin(a + time * speed) * d; });
    }
  }

  private buildBoard(cx: number, cz: number, size: number, t: Theme) {
    const tile = size / 8;
    const light: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const g = new THREE.BoxGeometry(tile, 0.12, tile);
        g.translate(cx - size / 2 + tile * (f + 0.5), 0.04, cz - size / 2 + tile * (r + 0.5));
        ((f + r) % 2 === 0 ? light : dark).push(g);
      }
    }
    const merge = (gs: THREE.BufferGeometry[], color: string, rough: number) => {
      const geo = mergeGeometries(gs, false)!;
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: 0.05 }));
      mesh.receiveShadow = true;
      this.realmGroup.add(mesh);
    };
    merge(light, t.board.light, 0.35);
    merge(dark, t.board.dark, 0.45);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(size + 1.2, 0.1, size + 1.2),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(t.board.frame), roughness: 0.6 }),
    );
    frame.position.set(cx, 0.0, cz);
    frame.receiveShadow = true;
    this.realmGroup.add(frame);
  }

  private buildWalls(realm: RealmDef, t: Theme, mats: Record<MatKey, THREE.Material>) {
    const stone: THREE.BufferGeometry[] = [];
    const trim: THREE.BufferGeometry[] = [];
    const hedge: THREE.BufferGeometry[] = [];
    const thick = 0.9;
    for (const w of realm.walls) {
      const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      if (len < 0.01) continue;
      const alongX = Math.abs(w.x2 - w.x1) > Math.abs(w.z2 - w.z1);
      const sx = alongX ? len + thick : thick;
      const sz = alongX ? thick : len + thick;
      const cx = (w.x1 + w.x2) / 2, cz = (w.z1 + w.z2) / 2;
      const g = new THREE.BoxGeometry(sx, w.height, sz);
      g.translate(cx, w.height / 2, cz);
      (w.style === 'hedge' ? hedge : stone).push(g);
      if (w.style === 'stone') {
        const tg = new THREE.BoxGeometry(sx + 0.2, 0.25, sz + 0.2);
        tg.translate(cx, w.height + 0.12, cz);
        trim.push(tg);
      }
      this.boxes.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, h: w.height + (w.style === 'stone' ? 0.25 : 0) });
    }
    const wallMat = new THREE.MeshStandardMaterial({ color: t.wall, roughness: 0.85 });
    const trimMat = new THREE.MeshStandardMaterial({ color: t.wallTrim, roughness: 0.5, metalness: 0.3 });
    const add = (gs: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!gs.length) return;
      const group = mergeParts(gs.map((geo) => ({ geo, mat: 'stone' as MatKey })), { ...mats, stone: mat });
      this.realmGroup.add(group);
    };
    add(stone, wallMat);
    add(trim, trimMat);
    add(hedge, mats.leafDark);
  }

  // -------------------------------------------------------------------------
  // Entities

  private isDoorOpen(d: DoorDef): boolean {
    const s = game.save;
    if (!s) return false;
    if ('puzzle' in d.opens) return s.solved.includes(d.id);
    return d.opens.defeat.every((id) => s.defeated.includes(id));
  }

  private buildDoor(d: DoorDef, t: Theme) {
    const group = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(d.width, d.height, 0.7),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(t.wall).multiplyScalar(0.8), roughness: 0.7 }),
    );
    slab.position.y = d.height / 2;
    slab.castShadow = true;
    group.add(slab);
    // A glowing emblem on both faces: a chessboard for puzzle locks, a seal for defeat locks.
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const glow = '#' + new THREE.Color(t.accent).getHexString();
    if ('puzzle' in d.opens) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        ctx.fillStyle = (i + j) % 2 ? glow : 'rgba(255,255,255,0.9)';
        ctx.fillRect(16 + i * 24, 16 + j * 24, 24, 24);
      }
      ctx.strokeStyle = glow;
      ctx.lineWidth = 6;
      ctx.strokeRect(12, 12, 104, 104);
    } else {
      ctx.strokeStyle = '#ff6a4a';
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(64, 64, 48, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, 30); ctx.lineTo(98, 98); ctx.moveTo(98, 30); ctx.lineTo(30, 98); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const emblemMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), emblemMat);
      e.position.set(0, d.height * 0.55, side * 0.36);
      if (side < 0) e.rotation.y = Math.PI;
      group.add(e);
    }
    group.position.set(d.x, 0, d.z);
    group.rotation.y = d.rot;
    this.realmGroup.add(group);
    const alongX = Math.abs(d.rot) < 0.1;
    const hw = d.width / 2 + 0.1, hd = 0.45;
    const box: Box = {
      minX: d.x - (alongX ? hw : hd), maxX: d.x + (alongX ? hw : hd),
      minZ: d.z - (alongX ? hd : hw), maxZ: d.z + (alongX ? hd : hw),
      h: 99, id: d.id,
    };
    const ent: DoorEnt = { def: d, group, box, opening: 0, open: false };
    if (this.isDoorOpen(d)) {
      ent.open = true;
      group.visible = false;
    } else {
      this.boxes.push(box);
    }
    this.doors.push(ent);
  }

  /** Opens any door whose condition is now met. Returns true if one moved. */
  refreshDoors(): boolean {
    let any = false;
    for (const d of this.doors) {
      if (!d.open && this.isDoorOpen(d.def)) {
        d.open = true;
        d.opening = 0.0001;
        any = true;
        sfx('door');
      }
    }
    return any;
  }

  private buildChest(def: ChestDef) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a4f2a, roughness: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe8b64a, roughness: 0.3, metalness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.95), wood);
    body.position.y = 0.4;
    body.castShadow = true;
    group.add(body);
    for (const x of [-0.5, 0.5]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.84, 1.0), gold);
      band.position.set(x, 0.42, 0);
      group.add(band);
    }
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.8, -0.475);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 1.4, 16, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2;
    lid.position.set(0, 0, 0.475);
    lid.castShadow = true;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.1), gold);
    lock.position.set(0, 0.02, 0.96);
    hinge.add(lid, lock);
    group.add(hinge);
    group.position.set(def.x, 0, def.z);
    group.rotation.y = def.rot ?? 0;
    this.realmGroup.add(group);
    const opened = game.save?.opened.includes(def.id) ?? false;
    if (opened) hinge.rotation.x = -1.9;
    this.chests.push({ def, group, lid: hinge, opened });
    this.circles.push({ x: def.x, z: def.z, r: 0.85, h: 0.9 });
  }

  /** Plays the lid-opening animation, returning when the treasure is out. */
  openChest(id: string): Promise<void> {
    const c = this.chests.find((x) => x.def.id === id);
    if (!c) return Promise.resolve();
    c.opened = true;
    sfx('chest');
    return new Promise((resolve) => {
      let t = 0;
      const glow = new THREE.PointLight(0xffd27a, 0, 8);
      glow.position.set(0, 1.4, 0);
      c.group.add(glow);
      const anim = (_: number, dt: number) => {
        t += dt;
        c.lid.rotation.x = -1.9 * Math.min(1, t / 0.6) ** 0.6;
        glow.intensity = Math.min(1, t) * 6 * Math.max(0, 1.6 - t);
        if (t > 1.1) {
          this.animated = this.animated.filter((a) => a !== anim);
          c.group.remove(glow);
          resolve();
        }
      };
      this.animated.push(anim);
    });
  }

  private buildPortal(def: PortalDef) {
    const group = new THREE.Group();
    const dest = THEMES[REALMS[def.to].theme];
    const unlocked = !def.requires || (game.save?.wallet[def.requires] ?? 0) > 0;
    const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: dest.accent, roughness: 0.35, metalness: 0.6, emissive: dest.accent, emissiveIntensity: 0.25 });
    for (const x of [-2.3, 2.3]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5.4, 0.9), stone);
      p.position.set(x, 2.7, 0);
      p.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.1), gold);
      cap.position.set(x, 5.5, 0);
      group.add(p, cap);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.8, 1.1), stone);
    lintel.position.y = 6;
    lintel.castShadow = true;
    group.add(lintel);
    const discMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(unlocked ? dest.accent : 0x555566) },
        power: { value: unlocked ? 1 : 0.35 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float time; uniform vec3 color; uniform float power; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float swirl = sin(a * 5.0 + r * 9.0 - time * 3.0) * 0.5 + 0.5;
          float core = smoothstep(1.0, 0.0, r);
          vec3 c = mix(color * 0.4, color * 1.6 + 0.25, swirl * core);
          float alpha = smoothstep(1.0, 0.86, r) * (0.55 + 0.45 * core) * power;
          gl_FragColor = vec4(c, alpha);
          #include <colorspace_fragment>
        }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), discMat);
    disc.scale.y = 1.35;
    disc.position.y = 2.8;
    group.add(disc);

    let icon: THREE.Object3D | undefined;
    if (def.requires) {
      const look = unlocked ? heroLook() : stoneLook();
      icon = pieceModel(def.requires, look, false);
      icon.scale.setScalar(0.7);
      icon.position.y = 6.5;
      group.add(icon);
    }
    const label = textSprite(def.label, {
      sub: def.requires ? (unlocked ? 'Open' : `Sealed — needs a ${PIECE_NAMES[def.requires]}`) : undefined,
      size: def.requires ? 1.1 : 0.9,
    });
    label.position.y = def.requires ? 8.9 : 7.3;
    group.add(label);

    group.position.set(def.x, 0, def.z);
    group.rotation.y = Math.atan2(-def.x, -def.z);
    this.realmGroup.add(group);
    const side = new THREE.Vector3(Math.cos(group.rotation.y), 0, -Math.sin(group.rotation.y));
    for (const s of [-2.3, 2.3]) this.circles.push({ x: def.x + side.x * s, z: def.z + side.z * s, r: 0.65, h: 99 });
    this.portals.push({ def, group, disc, icon, unlocked });
    this.animated.push((t) => {
      discMat.uniforms.time.value = t;
      if (icon) icon.rotation.y = t * 0.8;
    });
  }

  private buildSign(def: SignDef) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.8 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.4, 6), wood);
    post.position.y = 0.7;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.12), wood);
    board.position.y = 1.45;
    board.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xe9d7b0, roughness: 0.9 }));
    face.position.set(0, 1.45, 0.065);
    group.add(post, board, face);
    group.position.set(def.x, 0, def.z);
    this.realmGroup.add(group);
    this.signs.push(def);
    this.circles.push({ x: def.x, z: def.z, r: 0.35, h: 99 });
  }

  private buildNpc(def: NpcDef) {
    const look = heroLook();
    (look.body as THREE.MeshStandardMaterial).color.setHex(0xfff8e8);
    const model = pieceModel(def.kind, look);
    model.scale.setScalar(1.25);
    const group = new THREE.Group();
    group.add(model);
    const label = textSprite(def.name, { size: 0.55 });
    label.position.y = 3.4;
    group.add(label);
    group.position.set(def.x, 0, def.z);
    this.realmGroup.add(group);
    this.npcs.push({ def, group });
    this.circles.push({ x: def.x, z: def.z, r: 0.8, h: 99 });
    this.animated.push((t) => {
      model.position.y = Math.abs(Math.sin(t * 2)) * 0.06;
      const want = Math.atan2(this.heroPos.x - def.x, this.heroPos.z - def.z);
      model.rotation.y += angleDiff(model.rotation.y, want) * 0.08;
    });
  }

  private buildEnemy(def: EnemyDef, t: Theme) {
    const defeated = game.save?.defeated.includes(def.id) ?? false;
    const scale = def.boss ? (def.final ? 2.6 : 2.2) : 1.35;
    const group = new THREE.Group();
    const model = pieceModel(def.kind, defeated ? stoneLook() : enemyLook(def.final ? 0xff3a1a : t.accent), !defeated);
    model.scale.setScalar(scale);
    group.add(model);
    const label = textSprite(def.name, { size: def.boss ? 0.8 : 0.55, sub: def.boss ? 'Boss' : undefined, bg: 'rgba(40,10,20,0.75)' });
    label.position.y = 2.2 * scale + 0.9;
    label.visible = false;
    group.add(label);
    const alert = textSprite('!', { size: 0.9, bg: 'rgba(200,40,40,0.9)' });
    alert.position.y = 2.2 * scale + 0.4;
    alert.visible = false;
    group.add(alert);
    if (def.boss && !defeated) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(scale * 0.9, scale * 1.15, 48),
        new THREE.MeshBasicMaterial({ color: t.accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.14;
      group.add(ring);
      this.animated.push((time) => { ring.rotation.z = time * 0.6; });
    }
    const pos = new THREE.Vector3(def.x, 0, def.z);
    group.position.copy(pos);
    this.realmGroup.add(group);
    const collider: Circle = { x: def.x, z: def.z, r: 0.62 * scale, h: 99 };
    this.circles.push(collider);
    this.enemies.push({
      def, group, model, label, alert, scale, pos, home: pos.clone(), wp: 0, pause: 1,
      defeated, noticed: false, collider,
    });
  }

  /** Turns a beaten enemy to stone (they stay as a monument to your win). */
  petrify(id: string) {
    const e = this.enemies.find((x) => x.def.id === id);
    if (!e) return;
    e.defeated = true;
    e.group.remove(e.model);
    e.model = pieceModel(e.def.kind, stoneLook(), false);
    e.model.scale.setScalar(e.scale);
    e.model.rotation.y = Math.atan2(this.heroPos.x - e.pos.x, this.heroPos.z - e.pos.z);
    e.group.add(e.model);
    e.label.visible = false;
    e.alert.visible = false;
    for (const c of e.group.children) if (c instanceof THREE.Mesh && c.geometry instanceof THREE.RingGeometry) c.visible = false;
  }

  /** Nudges the hero away from an enemy so a declined duel does not re-trigger at once. */
  stepBackFrom(id: string) {
    const e = this.enemies.find((x) => x.def.id === id);
    if (!e) return;
    const dx = this.heroPos.x - e.pos.x, dz = this.heroPos.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.heroPos.x = e.pos.x + (dx / d) * (e.collider.r + 3.2);
    this.heroPos.z = e.pos.z + (dz / d) * (e.collider.r + 3.2);
    e.pause = 4;
    e.noticed = false;
    this.resolveCollisions();
  }

  // -------------------------------------------------------------------------
  // Hero

  /** Rebuilds the hero model if their form changed. Returns the new form. */
  refreshHero(): Form {
    this.form = currentForm(game.save?.wallet ?? { p: 3, n: 0, b: 0, r: 0, q: 0 });
    if (this.heroKind !== this.form.kind) {
      if (this.heroModel) this.hero.remove(this.heroModel);
      this.heroModel = pieceModel(this.form.kind, heroLook());
      this.hero.add(this.heroModel);
      this.heroKind = this.form.kind;
    }
    this.hero.position.copy(this.heroPos);
    this.hero.rotation.y = this.heroYaw;
    return this.form;
  }

  get heroPosition(): { x: number; z: number } {
    return { x: this.heroPos.x, z: this.heroPos.z };
  }

  /** A little celebratory spin when the hero changes form. */
  celebrate() {
    let t = 0;
    const anim = (_: number, dt: number) => {
      t += dt;
      if (this.heroModel) {
        this.heroModel.rotation.y = t * 14 * Math.max(0, 1 - t / 1.2);
        this.heroModel.position.y = Math.sin(Math.min(1, t / 1.2) * Math.PI) * 1.2;
      }
      if (t > 1.2) {
        if (this.heroModel) { this.heroModel.rotation.y = 0; this.heroModel.position.y = 0; }
        this.animated = this.animated.filter((a) => a !== anim);
      }
    };
    this.animated.push(anim);
  }

  private resolveCollisions() {
    const p = this.heroPos;
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.circles) {
        if (this.heroY > c.h) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + HERO_R;
        if (d < min && d > 1e-5) {
          p.x = c.x + (dx / d) * min;
          p.z = c.z + (dz / d) * min;
        }
      }
      for (const b of this.boxes) {
        if (this.heroY > b.h - 0.05) continue;
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - cx, dz = p.z - cz;
        const d = Math.hypot(dx, dz);
        if (d < HERO_R) {
          if (d > 1e-5) {
            p.x = cx + (dx / d) * HERO_R;
            p.z = cz + (dz / d) * HERO_R;
          } else {
            // Centre inside the box: push out along the shallowest side.
            const pushes = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
            const i = pushes.indexOf(Math.min(...pushes));
            if (i === 0) p.x = b.minX - HERO_R; else if (i === 1) p.x = b.maxX + HERO_R;
            else if (i === 2) p.z = b.minZ - HERO_R; else p.z = b.maxZ + HERO_R;
          }
        }
      }
    }
    const lim = this.realm.half - 0.8;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));
  }

  // -------------------------------------------------------------------------
  // Frame loop

  setRendering(on: boolean) {
    this.rendering = on;
    if (on) this.clock.getDelta();
  }

  private frame() {
    if (!this.rendering || !this.realm) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const t = this.time;

    if (this.mode === 'play') this.updateHero(dt);
    else this.input.poll(dt);
    this.updateEnemies(dt);
    this.updateDoors(dt);
    for (const a of [...this.animated]) a(t, dt);
    this.particles?.update(dt, t, this.heroPos);
    if (this.mode === 'play') this.updateInteractions();
    this.updateCamera(dt);

    this.sky.position.copy(this.camera.position);
    this.sun.position.set(this.heroPos.x + 25, 45, this.heroPos.z + 18);
    this.sun.target.position.copy(this.heroPos);
    this.renderer.render(this.scene, this.camera);
  }

  private updateHero(dt: number) {
    const inp = this.input;
    inp.poll(dt);
    const turn = inp.consumeTurn();
    if (turn) {
      this.camYaw += turn;
      this.manualCamTimer = 2.5;
    }
    if (inp.consumeMenu()) this.events?.menu();

    // Movement relative to the camera.
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    const mx = fx * inp.move.y + rx * inp.move.x;
    const mz = fz * inp.move.y + rz * inp.move.x;
    const mag = Math.min(1, Math.hypot(mx, mz));
    const speed = this.form.speed;
    const targetVx = mx * speed, targetVz = mz * speed;
    const accel = mag > 0.05 ? 14 : 18;
    this.heroVel.x += (targetVx - this.heroVel.x) * Math.min(1, accel * dt);
    this.heroVel.z += (targetVz - this.heroVel.z) * Math.min(1, accel * dt);
    this.heroPos.x += this.heroVel.x * dt;
    this.heroPos.z += this.heroVel.z * dt;

    const moving = Math.hypot(this.heroVel.x, this.heroVel.z);
    if (mag > 0.05) {
      const want = Math.atan2(mx, mz);
      this.heroYaw += angleDiff(this.heroYaw, want) * Math.min(1, 12 * dt);
    }

    // Jumping (Knight form and beyond).
    if (inp.consumeJump()) {
      if (this.form.canJump && this.heroY <= 0.001) {
        this.heroVy = this.form.jumpPower;
        sfx('jump');
      } else if (!this.form.canJump && this.current) {
        // Pawns cannot jump, so Space doubles as the action key for them.
        this.events?.interact(this.current);
      }
    }
    if (this.heroY > 0 || this.heroVy > 0) {
      this.heroVy -= GRAVITY * dt;
      this.heroY = Math.max(0, this.heroY + this.heroVy * dt);
      if (this.heroY === 0) this.heroVy = 0;
    }

    this.resolveCollisions();

    // Waddle and bob. Knights hop instead of walking.
    this.walkPhase += dt * (4 + moving * 1.4);
    const m = this.heroModel!;
    const stride = Math.min(1, moving / 3);
    if (this.form.kind === 'n') {
      m.position.y = Math.abs(Math.sin(this.walkPhase * 0.9)) * 0.35 * stride;
      m.rotation.x = Math.sin(this.walkPhase * 0.9) * 0.12 * stride;
      m.rotation.z = 0;
    } else {
      m.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.14 * stride;
      m.rotation.z = Math.sin(this.walkPhase) * 0.1 * stride;
      m.rotation.x = 0.06 * stride;
    }
    this.hero.position.set(this.heroPos.x, this.heroY, this.heroPos.z);
    this.hero.rotation.y = this.heroYaw;

    // Ocarina-style camera: drifts behind you while you run, unless you just turned it.
    this.manualCamTimer -= dt;
    // Only forward motion pulls the camera round, so strafing and backing up stay steady.
    const forward = Math.max(0, inp.move.y);
    if (this.manualCamTimer <= 0 && forward > 0.3) {
      const behind = this.heroYaw + Math.PI;
      const diff = angleDiff(this.camYaw, behind);
      if (Math.abs(diff) < 2.3) this.camYaw += diff * Math.min(1, 1.1 * dt) * forward;
    }

    // Portals.
    let near = false;
    for (const p of this.portals) {
      const d = Math.hypot(this.heroPos.x - p.def.x, this.heroPos.z - p.def.z);
      if (d < 2.2) {
        near = true;
        if (this.portalArmed) {
          this.portalArmed = false;
          this.events?.portal(p.def);
        }
      }
    }
    if (!near) this.portalArmed = true;
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      const dHero = Math.hypot(this.heroPos.x - e.pos.x, this.heroPos.z - e.pos.z);
      e.label.visible = !e.defeated && dHero < 16;
      if (e.defeated) continue;
      e.model.position.y = Math.abs(Math.sin(this.time * 2.2 + e.home.x)) * 0.08 * e.scale;
      e.pause -= dt;

      const canNotice = !e.def.boss && this.mode === 'play' && e.pause <= 0;
      e.noticed = canNotice ? dHero < 9 || (e.noticed && dHero < 13) : !!e.def.boss && dHero < 14;
      e.alert.visible = e.noticed && !e.def.boss && dHero > e.collider.r + 3.4;
      let target: THREE.Vector3 | null = null;
      if (e.noticed) {
        if (!e.def.boss && dHero > 2.6 + e.collider.r) target = tmpV.set(this.heroPos.x, 0, this.heroPos.z);
        const want = Math.atan2(this.heroPos.x - e.pos.x, this.heroPos.z - e.pos.z);
        e.model.rotation.y += angleDiff(e.model.rotation.y, want) * Math.min(1, 6 * dt);
      } else if (e.def.patrol && e.pause <= 0) {
        const wp = e.def.patrol[e.wp];
        target = tmpV.set(wp[0], 0, wp[1]);
        if (Math.hypot(wp[0] - e.pos.x, wp[1] - e.pos.z) < 0.4) {
          e.wp = (e.wp + 1) % e.def.patrol.length;
          e.pause = 1.2 + Math.random() * 1.5;
          target = null;
        }
      }
      if (target) {
        const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const sp = e.noticed ? 2.6 : 1.5;
        e.pos.x += (dx / d) * sp * dt;
        e.pos.z += (dz / d) * sp * dt;
        // Stay out of walls.
        for (const b of this.boxes) {
          const r = e.collider.r;
          if (e.pos.x > b.minX - r && e.pos.x < b.maxX + r && e.pos.z > b.minZ - r && e.pos.z < b.maxZ + r) {
            e.pos.x -= (dx / d) * sp * dt;
            e.pos.z -= (dz / d) * sp * dt;
          }
        }
        if (!e.noticed) {
          const want = Math.atan2(dx, dz);
          e.model.rotation.y += angleDiff(e.model.rotation.y, want) * Math.min(1, 5 * dt);
        }
        e.group.position.set(e.pos.x, 0, e.pos.z);
        e.collider.x = e.pos.x;
        e.collider.z = e.pos.z;
      }
    }
  }

  private updateDoors(dt: number) {
    for (const d of this.doors) {
      if (d.opening <= 0) continue;
      d.opening += dt;
      const k = Math.min(1, d.opening / 1.4);
      d.group.position.y = -d.def.height * 1.05 * k * k;
      d.group.position.x = d.def.x + Math.sin(d.opening * 60) * 0.04 * (1 - k);
      if (k >= 1) {
        d.opening = 0;
        d.group.visible = false;
        this.boxes = this.boxes.filter((b) => b !== d.box);
      }
    }
  }

  private updateInteractions() {
    const p = this.heroPos;
    let best: { t: Interactable; d: number; text: string } | null = null;
    const consider = (t: Interactable, x: number, z: number, range: number, text: string) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < range && (!best || d < best.d)) best = { t, d, text };
    };
    for (const e of this.enemies) {
      if (e.defeated) continue;
      consider({ type: 'enemy', def: e.def }, e.pos.x, e.pos.z, e.collider.r + 3.4, `Challenge ${e.def.name.split(',')[0]}`);
    }
    for (const c of this.chests) if (!c.opened) consider({ type: 'chest', def: c.def }, c.def.x, c.def.z, 2.4, 'Open chest');
    for (const d of this.doors) {
      if (d.open) continue;
      consider({ type: 'door', def: d.def }, d.def.x, d.def.z, 2.8, 'puzzle' in d.def.opens ? `Solve: ${d.def.name}` : `Inspect: ${d.def.name}`);
    }
    for (const s of this.signs) consider({ type: 'sign', def: s }, s.x, s.z, 2.2, 'Read sign');
    for (const n of this.npcs) consider({ type: 'npc', def: n.def }, n.def.x, n.def.z, 3, `Talk to ${n.def.name}`);

    const found = best as { t: Interactable; d: number; text: string } | null;
    this.current = found?.t ?? null;
    const text = found?.text ?? null;
    if (text !== this.lastPrompt) {
      this.lastPrompt = text;
      this.events?.prompt(text);
    }
    if (this.input.consumeAction() && this.current) this.events?.interact(this.current);
  }

  private updateCamera(dt: number) {
    if (this.mode === 'title') {
      // Slow orbit for the title screen.
      this.camYaw += dt * 0.08;
      const r = 34;
      this.camera.position.set(Math.sin(this.camYaw) * r, 16, Math.cos(this.camYaw) * r);
      this.camera.lookAt(0, 2, 0);
      return;
    }
    const pitch = 0.44;
    const dist = this.camDist;
    const target = tmpV.set(this.heroPos.x, this.heroY * 0.5 + 2.2, this.heroPos.z);
    const want = new THREE.Vector3(
      target.x + Math.sin(this.camYaw) * dist * Math.cos(pitch),
      target.y + dist * Math.sin(pitch) + 1.2,
      target.z + Math.cos(this.camYaw) * dist * Math.cos(pitch),
    );
    this.camera.position.lerp(want, Math.min(1, 10 * dt));
    this.camera.lookAt(target);
  }

  /** Hands control to the player (or takes it away during menus and duels). */
  setMode(mode: 'title' | 'play' | 'frozen') {
    this.mode = mode;
    this.input.enabled = mode === 'play';
    this.input.clear();
    if (mode !== 'play') this.events?.prompt(null);
    this.lastPrompt = null;
    this.hero.visible = mode !== 'title';
    if (mode === 'play') {
      // Snap the camera so it does not swoop in from the title orbit.
      this.updateCamera(1);
    }
  }
}

function angleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
