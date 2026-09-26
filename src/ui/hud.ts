// The heads-up display while exploring, plus dialog boxes, toasts and the
// "you got a piece!" reward card.

import { sfx } from '../audio/sound.ts';
import { MAJOR_KINDS, PIECE_NAMES, PIECE_PLURALS, type Form, type ModelKind, type PieceKind, type Wallet } from '../game/pieces.ts';
import { button, el, screen, wait } from './dom.ts';
import { pieceIcon } from './icons.ts';

export class Hud {
  readonly root: HTMLElement;
  private realmName: HTMLElement;
  private formName: HTMLElement;
  private wallet: HTMLElement;
  private prompt: HTMLElement;
  private toasts: HTMLElement;
  onMenu: () => void = () => {};
  onPromptTap: () => void = () => {};

  constructor(host: HTMLElement) {
    this.realmName = el('div', { class: 'realm-name' });
    this.formName = el('div', { class: 'form-name' });
    this.wallet = el('div', { class: 'wallet' });
    this.prompt = el('button', { class: 'prompt', type: 'button' });
    this.toasts = el('div', { class: 'toasts' });
    const menu = button(el('span', { class: 'menu-icon' }, el('i'), el('i'), el('i')), () => this.onMenu(), 'menu-btn');
    menu.setAttribute('aria-label', 'Menu');
    this.prompt.addEventListener('click', () => this.onPromptTap());
    this.root = el('div', { id: 'hud' },
      el('div', { class: 'hud-top' },
        el('div', { class: 'realm-chip' }, this.realmName, this.formName),
        this.wallet,
        menu,
      ),
      this.prompt,
      this.toasts,
    );
    host.append(this.root);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
    document.getElementById('controls')!.classList.toggle('hidden', !on);
  }

  setRealm(name: string, form: Form) {
    this.realmName.textContent = name;
    this.formName.textContent = form.title;
  }

  setWallet(w: Wallet) {
    this.wallet.replaceChildren();
    for (const k of ['p', ...MAJOR_KINDS.slice().reverse()] as PieceKind[]) {
      if (k !== 'p' && w[k] === 0) continue;
      this.wallet.append(el('div', { class: 'wallet-item', title: PIECE_PLURALS[k] }, pieceIcon(k), el('b', {}, `${w[k]}`)));
    }
  }

  setPrompt(text: string | null) {
    if (!text) {
      this.prompt.classList.remove('on');
      return;
    }
    const key = document.body.classList.contains('touch') ? 'A' : 'E';
    this.prompt.replaceChildren(el('kbd', {}, key), text);
    this.prompt.classList.add('on');
  }

  toast(text: string, ms = 2600) {
    const t = el('div', { class: 'toast' }, text);
    this.toasts.append(t);
    setTimeout(() => t.classList.add('in'), 20);
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 400);
    }, ms);
  }

  /** Big realm title card when arriving somewhere. */
  async banner(title: string, sub: string) {
    const b = el('div', { class: 'banner' }, el('div', { class: 'banner-title' }, title), el('div', { class: 'banner-sub' }, sub));
    this.root.append(b);
    setTimeout(() => b.classList.add('in'), 20);
    await wait(2600);
    b.classList.remove('in');
    await wait(700);
    b.remove();
  }
}

/** A Zelda-style dialog box with a typewriter effect. Tap / E / Enter / Space to advance. */
export async function say(speaker: string, lines: string[]): Promise<void> {
  const box = el('div', { class: 'dialog' });
  const name = el('div', { class: 'dialog-name' }, speaker);
  const text = el('div', { class: 'dialog-text' });
  const more = el('div', { class: 'dialog-more' }, '▼');
  box.append(name, text, more);
  const layer = screen('dialog-layer');
  layer.append(box);

  for (const line of lines) {
    let skip = false;
    let done = false;
    const advance = new Promise<void>((resolve) => {
      const go = () => {
        if (!done) { skip = true; return; }
        cleanup();
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (['Enter', ' ', 'e', 'E', 'f', 'F', 'Escape'].includes(e.key)) { e.preventDefault(); go(); }
      };
      const cleanup = () => {
        layer.removeEventListener('pointerup', go);
        removeEventListener('keydown', onKey);
      };
      layer.addEventListener('pointerup', go);
      addEventListener('keydown', onKey);
    });
    text.textContent = '';
    more.classList.remove('on');
    for (let i = 0; i < line.length; i++) {
      if (skip) { text.textContent = line; break; }
      text.textContent += line[i];
      if (i % 3 === 0 && line[i] !== ' ') sfx('talk');
      await wait(18);
    }
    done = true;
    more.classList.add('on');
    await advance;
    sfx('select');
  }
  layer.remove();
}

/** The treasure card: shows each piece gained. */
export async function showReward(title: string, pieces: Partial<Wallet>, extra?: string, hero?: ModelKind): Promise<void> {
  sfx('reward');
  const layer = screen('reward-layer');
  const row = el('div', { class: 'reward-pieces' });
  for (const k of [...MAJOR_KINDS, 'p'] as PieceKind[]) {
    const n = pieces[k] ?? 0;
    for (let i = 0; i < n; i++) row.append(el('div', { class: 'reward-piece' }, pieceIcon(k), el('small', {}, PIECE_NAMES[k])));
  }
  await new Promise<void>((resolve) => {
    layer.append(el('div', { class: 'reward-card' },
      hero ? el('div', { class: 'reward-hero' }, pieceIcon(hero)) : null,
      el('div', { class: 'reward-title' }, title),
      row.childElementCount ? row : null,
      extra ? el('p', { class: 'reward-extra' }, extra) : null,
      button('Continue', () => { sfx('confirm'); resolve(); }, 'btn primary'),
    ));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') { removeEventListener('keydown', onKey); resolve(); }
    };
    addEventListener('keydown', onKey);
  });
  layer.remove();
}
