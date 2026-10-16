import { Pool } from '../core/Pool';
import { easeOutBack } from '../core/math';

interface Item {
  text: string;
  sub: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  delay: number;
}

/**
 * Pooled pop-up labels ("BACKFLIP +100") anchored in world space and drawn in
 * screen space so text stays crisp at any zoom.
 */
export class FloatingText {
  private items: Item[] = [];
  private pool = new Pool<Item>(() => ({ text: '', sub: '', x: 0, y: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 1, delay: 0 }), 16);
  font = 'Lilita One, Fredoka, sans-serif';

  spawn(text: string, x: number, y: number, color = '#ffffff', size = 1, sub = '', delay = 0, life = 1.3): void {
    if (this.items.length > 24) this.pool.release(this.items.shift()!);
    const it = this.pool.acquire();
    it.text = text;
    it.sub = sub;
    it.x = x;
    it.y = y;
    it.vy = 1.6;
    it.life = life;
    it.maxLife = life;
    it.color = color;
    it.size = size;
    it.delay = delay;
    this.items.push(it);
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.delay > 0) {
        it.delay -= dt;
        continue;
      }
      it.life -= dt;
      it.y += it.vy * dt;
      it.vy *= Math.exp(-2.5 * dt);
      if (it.life <= 0) {
        this.items.splice(i, 1);
        this.pool.release(it);
      }
    }
  }

  clear(): void {
    for (const it of this.items) this.pool.release(it);
    this.items.length = 0;
  }

  /** `toScreen` maps world -> CSS pixels. `unit` is the base font size in px. */
  render(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number], unit: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const it of this.items) {
      if (it.delay > 0) continue;
      const age = it.maxLife - it.life;
      const pop = easeOutBack(Math.min(1, age / 0.22));
      const fade = Math.min(1, it.life / 0.35);
      const [sx, sy] = toScreen(it.x, it.y);
      const px = unit * it.size * pop;
      if (px < 1) continue;
      ctx.globalAlpha = fade;
      ctx.font = `${Math.round(px)}px ${this.font}`;
      ctx.lineWidth = Math.max(3, px * 0.18);
      ctx.strokeStyle = 'rgba(20,18,40,0.9)';
      ctx.strokeText(it.text, sx, sy);
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, sx, sy);
      if (it.sub) {
        const sp = Math.round(px * 0.62);
        ctx.font = `${sp}px ${this.font}`;
        ctx.lineWidth = Math.max(3, sp * 0.2);
        ctx.strokeText(it.sub, sx, sy + px * 0.85);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(it.sub, sx, sy + px * 0.85);
      }
    }
    ctx.globalAlpha = 1;
  }
}
