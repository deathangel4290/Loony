import type { Toast } from '../systems/events';
import type { Services } from '../systems/Services';
import { h, wait } from './dom';
import { icon } from './icons';

export interface Screen {
  el: HTMLElement;
  onShow?(params?: unknown): void;
  onHide?(): void;
  update?(dt: number): void;
  /** Return true if the back action was handled internally. */
  onBack?(): boolean;
}

/**
 * Owns the DOM overlay: screen transitions, modals, toasts and the scene
 * curtain. All buttons get consistent click sound + haptic feedback.
 */
export class UIManager {
  readonly root: HTMLElement;
  private screens = new Map<string, Screen>();
  current: string | null = null;
  private toastBox: HTMLElement;
  private curtainEl: HTMLElement;
  private modals: HTMLElement[] = [];
  private toastQueue: Toast[] = [];
  private toastsShown = 0;

  constructor(private services: Services) {
    this.root = document.getElementById('ui')!;
    this.toastBox = h('div', 'toasts');
    this.curtainEl = h('div', 'curtain', '<div class="wheel-spin"></div>');
    this.root.append(this.toastBox, this.curtainEl);
    // Global press feedback for every button.
    this.root.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('button, .cos-item, .card');
      if (!b || (b as HTMLButtonElement).disabled) return;
      this.services.audio.unlock();
      this.services.haptics.tap();
    });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const sfx = b.dataset.sfx;
      if (sfx === 'none') return;
      this.services.audio.play(sfx === 'back' ? 'back' : 'click');
    });
  }

  register(name: string, screen: Screen): void {
    this.screens.set(name, screen);
    screen.el.classList.add('screen');
    this.root.insertBefore(screen.el, this.toastBox);
  }

  get(name: string): Screen | undefined {
    return this.screens.get(name);
  }

  show(name: string, params?: unknown): void {
    const next = this.screens.get(name);
    if (!next) return;
    if (this.current && this.current !== name) {
      const prev = this.screens.get(this.current)!;
      prev.onHide?.();
      prev.el.classList.remove('shown');
      prev.el.classList.add('leaving');
      setTimeout(() => prev.el.classList.remove('leaving'), 200);
    }
    this.current = name;
    next.onShow?.(params);
    next.el.classList.remove('leaving');
    // force reflow so the enter transition plays
    void next.el.offsetWidth;
    next.el.classList.add('shown');
  }

  hideAll(): void {
    if (this.current) {
      const s = this.screens.get(this.current)!;
      s.onHide?.();
      s.el.classList.remove('shown');
    }
    this.current = null;
  }

  update(dt: number): void {
    if (this.current) this.screens.get(this.current)?.update?.(dt);
  }

  back(): boolean {
    if (this.modals.length) {
      const m = this.modals[this.modals.length - 1];
      (m.querySelector('[data-close]') as HTMLElement | null)?.click();
      return true;
    }
    if (this.current) return this.screens.get(this.current)?.onBack?.() ?? false;
    return false;
  }

  /** Show a modal; returns a close function. */
  modal(content: HTMLElement, opts: { dismissible?: boolean; onClose?: () => void } = {}): () => void {
    const m = h('div', 'modal');
    m.append(content);
    this.root.insertBefore(m, this.toastBox);
    this.modals.push(m);
    void m.offsetWidth;
    m.classList.add('shown');
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      m.classList.remove('shown');
      this.modals = this.modals.filter((x) => x !== m);
      setTimeout(() => m.remove(), 220);
      opts.onClose?.();
    };
    if (opts.dismissible) {
      m.addEventListener('click', (e) => {
        if (e.target === m) close();
      });
    }
    content.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', close));
    return close;
  }

  get hasModal(): boolean {
    return this.modals.length > 0;
  }

  confirm(title: string, body: string, ok = 'OK', cancel = 'Cancel', danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      const card = h('div', 'modal-card', `<h2>${title}</h2><p>${body}</p>`);
      const actions = h('div', 'modal-actions');
      const no = h('button', 'btn dark', cancel);
      no.dataset.sfx = 'back';
      const yes = h('button', `btn ${danger ? 'pink' : ''}`, ok);
      actions.append(no, yes);
      card.append(actions);
      let result = false;
      const close = this.modal(card, { onClose: () => resolve(result) });
      no.addEventListener('click', () => close());
      yes.addEventListener('click', () => {
        result = true;
        close();
      });
    });
  }

  toast(t: Toast): void {
    this.toastQueue.push(t);
    this.pumpToasts();
  }

  private pumpToasts(): void {
    while (this.toastQueue.length && this.toastsShown < 2) {
      const t = this.toastQueue.shift()!;
      this.toastsShown++;
      const el = h('div', `toast ${t.tone ?? ''}`, `<div class="ticon">${icon(t.icon ?? 'star')}</div><div><b>${t.title}</b>${t.subtitle ? `<small>${t.subtitle}</small>` : ''}</div>`);
      this.toastBox.append(el);
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => {
          el.remove();
          this.toastsShown--;
          this.pumpToasts();
        }, 300);
      }, 2600);
    }
  }

  /** Fade a curtain in, run work, fade out. */
  async transition(work: () => void | Promise<void>): Promise<void> {
    this.curtainEl.classList.add('on');
    this.services.audio.play('whoosh');
    await wait(230);
    await work();
    await wait(60);
    this.curtainEl.classList.remove('on');
  }
}
