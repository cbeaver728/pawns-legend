// Procedural 3D models: chess-piece characters (lathe-turned like real pieces)
// and the scenery of each realm. No model files — everything is built here,
// so the game downloads fast and every piece shares one art style.
//
// Convention: models stand on y = 0 and face +z.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelKind } from '../game/pieces.ts';
import type { PropKind } from '../data/realms.ts';

// ---------------------------------------------------------------------------
// Chess piece characters

type P = [number, number];

const BASE: P[] = [[0, 0], [0.62, 0], [0.65, 0.07], [0.62, 0.15], [0.5, 0.2], [0.53, 0.28], [0.44, 0.35]];

function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps = 8): P[] {
  const out: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push([Math.max(0, cx + rx * Math.cos(a)), cy + ry * Math.sin(a)]);
  }
  return out;
}

const deg = (d: number) => (d * Math.PI) / 180;

const PROFILES: Record<ModelKind, P[]> = {
  p: [...BASE, [0.32, 0.45], [0.22, 0.86], [0.37, 0.92], [0.37, 0.99], [0.2, 1.04], ...arc(0, 1.3, 0.33, 0.33, deg(-58), deg(90))],
  r: [...BASE, [0.42, 0.46], [0.36, 1.2], [0.47, 1.28], [0.47, 1.62], [0.34, 1.62], [0.34, 1.5], [0, 1.5]],
  b: [...BASE, [0.32, 0.48], [0.2, 1.05], [0.37, 1.12], [0.37, 1.19], [0.21, 1.23], ...arc(0, 1.55, 0.31, 0.4, deg(-62), deg(90)), [0.09, 1.95], ...arc(0, 2.03, 0.09, 0.09, deg(-60), deg(90), 4)],
  q: [...BASE, [0.36, 0.5], [0.23, 1.25], [0.41, 1.32], [0.41, 1.39], [0.25, 1.45], [0.37, 1.78], [0.28, 1.8], ...arc(0, 1.8, 0.28, 0.12, 0, deg(90), 4), ...arc(0, 1.98, 0.08, 0.08, deg(-60), deg(90), 4)],
  k: [...BASE, [0.37, 0.5], [0.25, 1.35], [0.43, 1.42], [0.43, 1.49], [0.27, 1.55], [0.39, 1.86], [0.2, 1.92], [0, 1.93]],
  n: [...BASE, [0.36, 0.5], [0.34, 0.64], [0, 0.64]],
};

/** Where each piece's eyes go: [height, forward, half-spacing]. */
const EYES: Record<ModelKind, [number, number, number]> = {
  p: [1.33, 0.29, 0.11],
  r: [1.38, 0.43, 0.13],
  b: [1.52, 0.27, 0.1],
  q: [1.6, 0.33, 0.11],
  k: [1.66, 0.35, 0.12],
  n: [1.56, 0.36, 0.19],
};

function knightHead(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const pts: P[] = [
    [-0.36, 0.6], [0.36, 0.6], [0.3, 0.9], [0.2, 1.1], [0.52, 1.3], [0.64, 1.44], [0.62, 1.58],
    [0.32, 1.74], [0.14, 1.88], [0.06, 2.04], [-0.08, 1.88], [-0.3, 1.72], [-0.44, 1.3], [-0.42, 0.9],
  ];
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  const depth = 0.34;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

export interface PieceLook {
  body: THREE.Material;
  trim?: THREE.Material;
  eye: THREE.Material;
}

export function heroLook(): PieceLook {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0xf4ecdb, roughness: 0.42, metalness: 0.05 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xd9a63a, roughness: 0.3, metalness: 0.8 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x1b1622, roughness: 0.2 }),
  };
}

export function enemyLook(glow: number): PieceLook {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0x2a2433, roughness: 0.28, metalness: 0.35 }),
    trim: new THREE.MeshStandardMaterial({ color: glow, roughness: 0.4, metalness: 0.5, emissive: glow, emissiveIntensity: 0.35 }),
    eye: new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 2.2 }),
  };
}

export function stoneLook(): PieceLook {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.95, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({ color: 0x6a655f, roughness: 1 }),
  };
}

/** A chess piece character. Returns a group standing on y=0 facing +z. */
export function pieceModel(kind: ModelKind, look: PieceLook, withEyes = true): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(PROFILES[kind].map(([x, y]) => new THREE.Vector2(x, y)), 28), look.body);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const trim = look.trim ?? look.body;
  // A band of trim around the base collar.
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 32), trim);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.26;
  g.add(band);

  if (kind === 'n') {
    const head = new THREE.Mesh(knightHead(), look.body);
    head.castShadow = true;
    g.add(head);
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.16), trim);
    mane.position.set(0, 1.42, -0.36);
    mane.rotation.x = -0.25;
    g.add(mane);
  }
  if (kind === 'r') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.16), look.body);
      c.position.set(Math.sin(a) * 0.4, 1.72, Math.cos(a) * 0.4);
      c.rotation.y = a;
      c.castShadow = true;
      g.add(c);
    }
  }
  if (kind === 'b') {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.12), trim);
    slit.position.set(0.1, 1.64, 0.24);
    slit.rotation.set(0.35, 0, -0.6);
    g.add(slit);
  }
  if (kind === 'q') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), trim);
      b.position.set(Math.sin(a) * 0.34, 1.83, Math.cos(a) * 0.34);
      g.add(b);
    }
  }
  if (kind === 'k') {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), trim);
    v.position.y = 2.12;
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.12), trim);
    h.position.y = 2.18;
    g.add(v, h);
  }
  if (withEyes) {
    const [y, fwd, sp] = EYES[kind];
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), look.eye);
      if (kind === 'n') e.position.set(side * sp, y, fwd * 0.9);
      else e.position.set(side * sp, y, fwd);
      e.scale.set(1, 1.35, 0.6);
      g.add(e);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Scenery. Each prop is a list of (geometry, material-key) parts that get
// merged per material, so a realm with hundreds of props is only a handful
// of draw calls — important for phones.

export type MatKey =
  | 'trunk' | 'leaf' | 'leaf2' | 'leafDark' | 'petalA' | 'petalB' | 'petalC' | 'stem'
  | 'stone' | 'stoneDark' | 'sandstone' | 'cactus' | 'gold' | 'snow' | 'ice' | 'crystal'
  | 'obsidian' | 'lava' | 'flame' | 'marble' | 'wood';

export function makeMaterials(accent: number): Record<MatKey, THREE.Material> {
  const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  return {
    trunk: std(0x7a5234),
    leaf: std(0x3f8f3a, { flatShading: true }),
    leaf2: std(0x5aa843, { flatShading: true }),
    leafDark: std(0x1f5a3a, { flatShading: true }),
    petalA: std(0xffd84a, { emissive: 0x332600 }),
    petalB: std(0xff7aa8, { emissive: 0x2a0010 }),
    petalC: std(0xffffff),
    stem: std(0x3d7a2e),
    stone: std(0x8f8a84, { flatShading: true }),
    stoneDark: std(0x55505a, { flatShading: true }),
    sandstone: std(0xd8a865, { flatShading: true }),
    cactus: std(0x4f8f45, { flatShading: true }),
    gold: std(0xe0b04a, { metalness: 0.8, roughness: 0.3 }),
    snow: std(0xf7fbff, { roughness: 0.6 }),
    ice: std(0xa9e4ff, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x16384a }),
    crystal: std(accent, { roughness: 0.15, emissive: accent, emissiveIntensity: 0.55, flatShading: true }),
    obsidian: std(0x1d1a22, { roughness: 0.25, metalness: 0.4, flatShading: true }),
    lava: std(0xff5a1f, { emissive: 0xff3a0a, emissiveIntensity: 1.4 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
    marble: std(0xece6da, { roughness: 0.35 }),
    wood: std(0x8a5a32),
  };
}

type Part = { geo: THREE.BufferGeometry; mat: MatKey };

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  return geo.applyMatrix4(m);
}

/** Collision radius (world units, before scale) for props that block movement. */
export const PROP_RADIUS: Partial<Record<PropKind, number>> = {
  tree: 0.7, bush: 0.8, rock: 0.9, cactus: 0.5, pyramid: 7.2, obelisk: 0.9,
  pine: 0.6, icespire: 0.6, tower: 2.7, statue: 1.2, column: 0.8, spike: 0.5,
  torch: 0.25, brazier: 0.8, crystal: 0.5,
};

export function propParts(kind: PropKind, rand: () => number): Part[] {
  const r = rand;
  switch (kind) {
    case 'tree': {
      const h = 1.6 + r() * 0.8;
      const leaf: MatKey = r() < 0.5 ? 'leaf' : 'leaf2';
      return [
        { geo: at(new THREE.CylinderGeometry(0.18, 0.28, h, 7), 0, h / 2, 0), mat: 'trunk' },
        { geo: at(new THREE.IcosahedronGeometry(1.35, 0), 0, h + 0.8, 0, r(), r(), 0), mat: leaf },
        { geo: at(new THREE.IcosahedronGeometry(0.95, 0), 0.5, h + 1.7, 0.2, r(), r(), 0), mat: leaf },
      ];
    }
    case 'bush':
      return [{ geo: at(new THREE.IcosahedronGeometry(0.8, 0), 0, 0.5, 0, r(), r(), 0, 1, 0.75, 1), mat: r() < 0.5 ? 'leaf' : 'leafDark' }];
    case 'flower': {
      const petal: MatKey = (['petalA', 'petalB', 'petalC'] as MatKey[])[Math.floor(r() * 3)];
      return [
        { geo: at(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), 0, 0.2, 0), mat: 'stem' },
        { geo: at(new THREE.IcosahedronGeometry(0.12, 0), 0, 0.42, 0), mat: petal },
      ];
    }
    case 'rock':
      return [{ geo: at(new THREE.DodecahedronGeometry(0.9, 0), 0, 0.35, 0, r(), r(), r(), 1, 0.7, 1.1), mat: 'stone' }];
    case 'cactus': {
      const h = 1.8 + r() * 1.2;
      const parts: Part[] = [{ geo: at(new THREE.CylinderGeometry(0.3, 0.34, h, 8), 0, h / 2, 0), mat: 'cactus' }];
      for (const side of [-1, 1]) {
        if (r() < 0.75) {
          const y = 0.8 + r() * (h - 1.4);
          parts.push({ geo: at(new THREE.CylinderGeometry(0.18, 0.18, 0.6, 7), side * 0.45, y, 0, 0, 0, Math.PI / 2), mat: 'cactus' });
          parts.push({ geo: at(new THREE.CylinderGeometry(0.17, 0.18, 0.8, 7), side * 0.72, y + 0.35, 0), mat: 'cactus' });
        }
      }
      return parts;
    }
    case 'pyramid':
      return [
        { geo: at(new THREE.ConeGeometry(7.5, 9, 4), 0, 4.5, 0, 0, Math.PI / 4, 0), mat: 'sandstone' },
        { geo: at(new THREE.ConeGeometry(0.9, 1.1, 4), 0, 9.05, 0, 0, Math.PI / 4, 0), mat: 'gold' },
      ];
    case 'obelisk':
      return [
        { geo: at(new THREE.BoxGeometry(1.4, 0.4, 1.4), 0, 0.2, 0), mat: 'sandstone' },
        { geo: at(new THREE.CylinderGeometry(0.35, 0.55, 4.2, 4), 0, 2.5, 0, 0, Math.PI / 4, 0), mat: 'sandstone' },
        { geo: at(new THREE.ConeGeometry(0.36, 0.6, 4), 0, 4.9, 0, 0, Math.PI / 4, 0), mat: 'gold' },
      ];
    case 'pine': {
      const s = 0.9 + r() * 0.5;
      return [
        { geo: at(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), 0, 0.6, 0), mat: 'trunk' },
        { geo: at(new THREE.ConeGeometry(1.3 * s, 1.8 * s, 7), 0, 1.4 + 0.5 * s, 0), mat: 'leafDark' },
        { geo: at(new THREE.ConeGeometry(1.0 * s, 1.5 * s, 7), 0, 2.2 + 0.8 * s, 0), mat: 'leafDark' },
        { geo: at(new THREE.ConeGeometry(0.62 * s, 1.1 * s, 7), 0, 2.9 + 1.1 * s, 0), mat: 'snow' },
      ];
    }
    case 'icespire': {
      const h = 2 + r() * 3;
      return [
        { geo: at(new THREE.ConeGeometry(0.5, h, 5), 0, h / 2, 0, 0.1 * (r() - 0.5), r(), 0.1 * (r() - 0.5)), mat: 'ice' },
        { geo: at(new THREE.ConeGeometry(0.3, h * 0.6, 5), 0.5, h * 0.3, 0.2, 0, r(), 0.3), mat: 'ice' },
      ];
    }
    case 'tower': {
      const parts: Part[] = [
        { geo: at(new THREE.CylinderGeometry(2.4, 2.7, 8, 14), 0, 4, 0), mat: 'stone' },
        { geo: at(new THREE.CylinderGeometry(2.9, 2.9, 0.6, 14), 0, 8.2, 0), mat: 'stone' },
        { geo: at(new THREE.CylinderGeometry(2.5, 2.5, 0.2, 14), 0, 8.2, 0), mat: 'snow' },
      ];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push({ geo: at(new THREE.BoxGeometry(1, 0.8, 0.6), Math.sin(a) * 2.6, 8.9, Math.cos(a) * 2.6, 0, a, 0), mat: 'stone' });
      }
      return parts;
    }
    case 'crystal': {
      const h = 1 + r() * 1.4;
      return [
        { geo: at(new THREE.OctahedronGeometry(0.5, 0), 0, 0.9 + h / 2, 0, 0, r(), 0, 0.7, h, 0.7), mat: 'crystal' },
        { geo: at(new THREE.OctahedronGeometry(0.3, 0), 0.6, 0.5, 0.2, 0.3, r(), 0, 0.6, 1.4, 0.6), mat: 'crystal' },
      ];
    }
    case 'statue': {
      const profile = PROFILES.q.map(([x, y]) => new THREE.Vector2(x, y));
      return [
        { geo: at(new THREE.BoxGeometry(2, 0.8, 2), 0, 0.4, 0), mat: 'stoneDark' },
        { geo: at(new THREE.LatheGeometry(profile, 20), 0, 0.8, 0, 0, 0, 0, 1.6), mat: 'marble' },
      ];
    }
    case 'column':
      return [
        { geo: at(new THREE.BoxGeometry(1.5, 0.4, 1.5), 0, 0.2, 0), mat: 'marble' },
        { geo: at(new THREE.CylinderGeometry(0.5, 0.55, 5, 12), 0, 2.9, 0), mat: 'marble' },
        { geo: at(new THREE.BoxGeometry(1.4, 0.35, 1.4), 0, 5.55, 0), mat: 'marble' },
      ];
    case 'spike': {
      const h = 1.2 + r() * 2.2;
      return [
        { geo: at(new THREE.ConeGeometry(0.45, h, 5), 0, h / 2, 0, 0.15 * (r() - 0.5), r(), 0.15 * (r() - 0.5)), mat: 'obsidian' },
        { geo: at(new THREE.CylinderGeometry(0.6, 0.7, 0.12, 6), 0, 0.06, 0), mat: 'lava' },
      ];
    }
    case 'torch':
      return [
        { geo: at(new THREE.CylinderGeometry(0.08, 0.12, 2, 6), 0, 1, 0), mat: 'wood' },
        { geo: at(new THREE.CylinderGeometry(0.22, 0.12, 0.3, 8), 0, 2.1, 0), mat: 'gold' },
        { geo: at(new THREE.IcosahedronGeometry(0.2, 0), 0, 2.38, 0, 0, 0, 0, 1, 1.5, 1), mat: 'flame' },
      ];
    case 'brazier':
      return [
        { geo: at(new THREE.CylinderGeometry(0.3, 0.45, 1.2, 8), 0, 0.6, 0), mat: 'stoneDark' },
        { geo: at(new THREE.CylinderGeometry(0.8, 0.45, 0.5, 10), 0, 1.4, 0), mat: 'gold' },
        { geo: at(new THREE.IcosahedronGeometry(0.5, 0), 0, 1.9, 0, 0, 0, 0, 1, 1.6, 1), mat: 'flame' },
      ];
  }
}

/** Merges parts by material into a few meshes. */
export function mergeParts(parts: Part[], mats: Record<MatKey, THREE.Material>, shadows = true): THREE.Group {
  const byMat = new Map<MatKey, THREE.BufferGeometry[]>();
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2));
    // Keep only the attributes every geometry has, or merging fails.
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    const list = byMat.get(p.mat) ?? [];
    list.push(g);
    byMat.set(p.mat, list);
  }
  const group = new THREE.Group();
  for (const [key, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mats[key]);
    const glows = key === 'flame' || key === 'lava';
    mesh.castShadow = shadows && !glows && key !== 'petalA' && key !== 'petalB' && key !== 'petalC' && key !== 'stem';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Moves a list of parts to a spot in the world. */
export function placeParts(parts: Part[], x: number, z: number, s = 1, rotY = 0): Part[] {
  for (const p of parts) at(p.geo, x, 0, z, 0, rotY, 0, s);
  return parts;
}

// ---------------------------------------------------------------------------
// Floating text labels

export function textSprite(text: string, opts: { color?: string; bg?: string; size?: number; sub?: string } = {}): THREE.Sprite {
  const scale = 2;
  const font = 44 * scale;
  const subFont = 28 * scale;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `700 ${font}px Cinzel, Georgia, serif`;
  const w1 = ctx.measureText(text).width;
  ctx.font = `600 ${subFont}px Nunito, system-ui, sans-serif`;
  const w2 = opts.sub ? ctx.measureText(opts.sub).width : 0;
  const pad = 26 * scale;
  c.width = Math.ceil(Math.max(w1, w2) + pad * 2);
  c.height = Math.ceil(font * 1.5 + (opts.sub ? subFont * 1.3 : 0));
  ctx.fillStyle = opts.bg ?? 'rgba(20,16,32,0.72)';
  const rr = 22 * scale;
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, rr);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${font}px Cinzel, Georgia, serif`;
  ctx.fillStyle = opts.color ?? '#fff6df';
  ctx.fillText(text, c.width / 2, font * 0.78);
  if (opts.sub) {
    ctx.font = `600 ${subFont}px Nunito, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,240,210,0.8)';
    ctx.fillText(opts.sub, c.width / 2, font * 1.45 + subFont * 0.35);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const h = opts.size ?? 0.8;
  sprite.scale.set((h * c.width) / c.height, h, 1);
  sprite.renderOrder = 10;
  return sprite;
}
