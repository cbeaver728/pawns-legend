// Ambient particles that make each realm feel alive: fireflies in the meadow,
// blowing sand, snowfall, twinkling stars, rising embers. They live in a box
// that follows the hero, so a few hundred points cover the whole realm.

import * as THREE from 'three';
import type { ParticleKind } from '../data/themes.ts';

const COUNT = 320;
const SPAN = 36;   // half-width of the box around the hero
const HEIGHT = 16;

let dotTexture: THREE.Texture | null = null;
function dot(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

const LOOK: Record<ParticleKind, { color: number | null; size: number; additive: boolean; opacity: number }> = {
  motes: { color: 0xfff1c0, size: 0.1, additive: true, opacity: 0.55 },
  fireflies: { color: 0xd8ff7a, size: 0.26, additive: true, opacity: 0.9 },
  dust: { color: 0xf5d9a0, size: 0.16, additive: false, opacity: 0.55 },
  snow: { color: 0xffffff, size: 0.2, additive: false, opacity: 0.9 },
  stars: { color: null, size: 0.24, additive: true, opacity: 0.95 },
  embers: { color: 0xff7a2a, size: 0.2, additive: true, opacity: 0.9 },
};

export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private seed: Float32Array;
  private material: THREE.PointsMaterial;

  constructor(private kind: ParticleKind, accent: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(COUNT * 3);
    this.seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.pos[i * 3] = (Math.random() * 2 - 1) * SPAN;
      this.pos[i * 3 + 1] = Math.random() * HEIGHT;
      this.pos[i * 3 + 2] = (Math.random() * 2 - 1) * SPAN;
      this.seed[i] = Math.random() * 100;
    }
    if (kind === 'fireflies' || kind === 'motes') {
      for (let i = 0; i < COUNT; i++) this.pos[i * 3 + 1] = 0.4 + Math.random() * 4;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const look = LOOK[kind];
    this.material = new THREE.PointsMaterial({
      color: look.color ?? accent,
      size: look.size,
      map: dot(),
      transparent: true,
      opacity: look.opacity,
      depthWrite: false,
      blending: look.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
      fog: kind !== 'stars',
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  update(dt: number, t: number, center: THREE.Vector3) {
    const p = this.pos;
    for (let i = 0; i < COUNT; i++) {
      const s = this.seed[i];
      let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      switch (this.kind) {
        case 'snow':
          y -= dt * (1.2 + (s % 1) * 0.8);
          x += Math.sin(t * 0.8 + s) * dt * 0.6;
          if (y < 0) y += HEIGHT;
          break;
        case 'dust':
          x += dt * (4 + (s % 3));
          y += Math.sin(t * 2 + s) * dt * 0.3;
          if (y > 4) y = 0.2;
          break;
        case 'embers':
          y += dt * (1 + (s % 1.5));
          x += Math.sin(t + s) * dt * 0.5;
          if (y > HEIGHT) y = 0;
          break;
        case 'fireflies':
        case 'motes':
          x += Math.sin(t * 0.7 + s) * dt * 0.6;
          z += Math.cos(t * 0.6 + s * 1.3) * dt * 0.6;
          y += Math.sin(t * 1.3 + s * 2) * dt * 0.3;
          break;
        case 'stars':
          y = 4 + (s % 12);
          break;
      }
      // Wrap around the hero so the particles never run out.
      const lx = x - center.x, lz = z - center.z;
      if (lx > SPAN) x -= SPAN * 2; else if (lx < -SPAN) x += SPAN * 2;
      if (lz > SPAN) z -= SPAN * 2; else if (lz < -SPAN) z += SPAN * 2;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    if (this.kind === 'fireflies' || this.kind === 'stars') {
      this.material.opacity = LOOK[this.kind].opacity * (0.7 + 0.3 * Math.sin(t * 2.3));
    }
  }
}
