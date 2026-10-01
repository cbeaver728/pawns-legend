// Keyboard, mouse and touch input for exploring.
//
//  PC:     WASD / arrows to move, mouse-drag or Q/R to turn the camera,
//          E / Enter to act, Space to jump, Esc for the menu,
//          C for camera mode (WASD then turns and tilts the camera).
//  Phone:  left thumb anywhere on the left half = floating joystick,
//          drag on the right half = turn the camera, A = act, B = jump.
//          The camera button switches the joystick between walking and
//          aiming the camera; the hero stands still while aiming.

import { unlockAudio } from '../audio/sound.ts';

export class Input {
  /** Movement: x = right, y = forward, length ≤ 1. */
  move = { x: 0, y: 0 };
  /** Camera turn accumulated since last frame (radians). */
  turn = 0;
  /** Camera tilt accumulated since last frame (radians, + = look down more). */
  tilt = 0;
  /** While on, the joystick / WASD aim the camera instead of moving the hero. */
  cameraMode = false;
  private keys = new Set<string>();
  private actionQueued = false;
  private jumpQueued = false;
  private menuQueued = false;
  enabled = true;
  isTouch = false;

  private stick: { id: number; ox: number; oy: number } | null = null;
  /** Where the joystick is pushed: x = right, y = up, length ≤ 1. */
  private stickVec = { x: 0, y: 0 };
  private look: { id: number; x: number; y: number } | null = null;
  private stickEl: HTMLElement;
  private knobEl: HTMLElement;
  private camBtn: HTMLElement;

  constructor(surface: HTMLElement, controls: HTMLElement) {
    this.stickEl = controls.querySelector('.stick')!;
    this.knobEl = controls.querySelector('.stick-knob')!;
    this.camBtn = controls.querySelector('.btn-cam')!;

    window.addEventListener('keydown', (e) => {
      unlockAudio();
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!this.enabled) return;
      if (k === 'e' || k === 'enter' || k === 'f') this.actionQueued = true;
      if (k === ' ') { this.jumpQueued = true; e.preventDefault(); }
      if (k === 'escape' || k === 'p') this.menuQueued = true;
      if (k === 'c') this.setCameraMode(!this.cameraMode);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    // Mouse drag turns and tilts the camera.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    surface.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; unlockAudio(); });
    window.addEventListener('mouseup', () => (dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!dragging || !this.enabled) return;
      this.turn -= (e.clientX - lastX) * 0.006;
      this.tilt += (e.clientY - lastY) * 0.004;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    surface.addEventListener('touchstart', (e) => this.touchStart(e), { passive: false });
    surface.addEventListener('touchmove', (e) => this.touchMove(e), { passive: false });
    surface.addEventListener('touchend', (e) => this.touchEnd(e));
    surface.addEventListener('touchcancel', (e) => this.touchEnd(e));

    const hold = (sel: string, fn: () => void) => {
      const b = controls.querySelector<HTMLElement>(sel)!;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); if (this.enabled) fn(); b.classList.add('down'); }, { passive: false });
      b.addEventListener('touchend', () => b.classList.remove('down'));
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); if (this.enabled) fn(); });
    };
    hold('.btn-a', () => (this.actionQueued = true));
    hold('.btn-b', () => (this.jumpQueued = true));
    hold('.btn-cam', () => this.setCameraMode(!this.cameraMode));
  }

  private touchStart(e: TouchEvent) {
    e.preventDefault();
    unlockAudio();
    this.isTouch = true;
    document.body.classList.add('touch');
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.5 && !this.stick) {
        this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        this.stickEl.style.left = `${t.clientX}px`;
        this.stickEl.style.top = `${t.clientY}px`;
        this.stickEl.classList.add('on');
        this.knobEl.style.transform = 'translate(-50%, -50%)';
      } else if (!this.look) {
        this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  }

  private touchMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (this.stick && t.identifier === this.stick.id) {
        const R = 56;
        let dx = t.clientX - this.stick.ox;
        let dy = t.clientY - this.stick.oy;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
        this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        // Small dead zone in the middle, full speed at the rim.
        const m = Math.min(1, len / R);
        const dead = 0.12;
        const mag = m < dead ? 0 : (m - dead) / (1 - dead);
        const r = Math.hypot(dx, dy) || 1;
        this.stickVec.x = (dx / r) * mag;
        this.stickVec.y = (-dy / r) * mag;
      } else if (this.look && t.identifier === this.look.id) {
        this.turn -= (t.clientX - this.look.x) * 0.008;
        this.tilt += (t.clientY - this.look.y) * 0.005;
        this.look.x = t.clientX;
        this.look.y = t.clientY;
      }
    }
  }

  private touchEnd(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) {
      if (this.stick && t.identifier === this.stick.id) {
        this.stick = null;
        this.stickVec.x = this.stickVec.y = 0;
        this.stickEl.classList.remove('on');
      }
      if (this.look && t.identifier === this.look.id) this.look = null;
    }
  }

  /** Turns the joystick (or keyboard) into hero movement, or camera aim in camera mode. */
  poll(dt: number) {
    if (!this.enabled) {
      this.move.x = this.move.y = 0;
      this.turn = this.tilt = 0;
      return;
    }
    let x = this.stickVec.x;
    let y = this.stickVec.y;
    if (!this.stick) {
      const k = this.keys;
      x = 0;
      y = 0;
      if (k.has('w') || k.has('arrowup')) y += 1;
      if (k.has('s') || k.has('arrowdown')) y -= 1;
      if (k.has('a') || k.has('arrowleft')) x -= 1;
      if (k.has('d') || k.has('arrowright')) x += 1;
      const l = Math.hypot(x, y) || 1;
      x /= l;
      y /= l;
    }
    if (this.cameraMode) {
      // Push right to look right; push up to look up (the camera dips lower).
      this.turn -= x * 2.4 * dt;
      this.tilt -= y * 0.9 * dt;
      this.move.x = this.move.y = 0;
    } else {
      this.move.x = x;
      this.move.y = y;
    }
    if (this.keys.has('q')) this.turn += 2.2 * dt;
    if (this.keys.has('r')) this.turn -= 2.2 * dt;
  }

  /** Queue an action press from on-screen UI (e.g. tapping the prompt). */
  pressAction() { if (this.enabled) this.actionQueued = true; }

  setCameraMode(on: boolean) {
    if (on && !this.enabled) return;
    this.cameraMode = on;
    document.body.classList.toggle('cam-mode', on);
    this.camBtn.classList.toggle('active', on);
    this.camBtn.setAttribute('aria-pressed', String(on));
  }

  consumeAction(): boolean { const a = this.actionQueued; this.actionQueued = false; return a; }
  consumeJump(): boolean { const a = this.jumpQueued; this.jumpQueued = false; return a; }
  consumeMenu(): boolean { const a = this.menuQueued; this.menuQueued = false; return a; }
  consumeTurn(): number { const t = this.turn; this.turn = 0; return t; }
  consumeTilt(): number { const t = this.tilt; this.tilt = 0; return t; }

  clear() {
    this.actionQueued = this.jumpQueued = this.menuQueued = false;
    this.turn = this.tilt = 0;
    this.move.x = this.move.y = 0;
    this.stickVec.x = this.stickVec.y = 0;
    this.stick = null;
    this.look = null;
    this.stickEl.classList.remove('on');
    // Always come back from menus and duels ready to walk.
    this.setCameraMode(false);
  }
}
