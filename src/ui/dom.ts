// Tiny DOM helpers so UI code stays readable without a framework.

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

export function button(label: Child, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** The layer every menu, dialog and board screen lives in. */
export function uiRoot(): HTMLElement {
  return document.getElementById('ui')!;
}

/** A full-screen overlay; call .remove() to close it. */
export function screen(cls: string): HTMLElement {
  const s = el('div', { class: `screen ${cls}` });
  uiRoot().append(s);
  return s;
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fades the whole view to black, runs `mid`, then fades back in. */
export async function fadeThrough(mid: () => void | Promise<void>, ms = 380): Promise<void> {
  const f = document.getElementById('fade')!;
  f.classList.add('on');
  await wait(ms);
  await mid();
  await wait(60);
  f.classList.remove('on');
  await wait(ms);
}
