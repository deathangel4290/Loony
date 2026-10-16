/** Tiny DOM helpers. */
export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

export const qs = <T extends Element = HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
};

export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

/** Animate a number in an element from `from` to `to`. Returns a cancel fn. */
export const countUp = (el: HTMLElement, from: number, to: number, ms: number, suffix = '', onTick?: () => void): (() => void) => {
  const start = performance.now();
  let raf = 0;
  let lastShown = -1;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const e = 1 - Math.pow(1 - t, 3);
    const v = Math.floor(from + (to - from) * e);
    if (v !== lastShown) {
      el.textContent = fmt(v) + suffix;
      lastShown = v;
      onTick?.();
    }
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
};

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
