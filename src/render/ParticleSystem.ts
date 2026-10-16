import { buildSoftDot } from './Sprites';

export const enum PK {
  Dust = 0,
  Smoke = 1,
  Spark = 2,
  Debris = 3,
  Sparkle = 4,
  Confetti = 5,
  Flame = 6,
  Bubble = 7,
  Heart = 8,
  Glow = 9,
}

export interface EmitOpts {
  kind: PK;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  spread?: number;
  speed?: number;
  life?: number;
  size?: number;
  growth?: number;
  gravity?: number;
  drag?: number;
  color: string;
  count?: number;
  angle?: number;
  spin?: number;
  alpha?: number;
}

/**
 * Fixed-capacity, allocation-free particle system (struct-of-arrays).
 * Particles live in world space (meters, y-up).
 */
export class ParticleSystem {
  private cap: number;
  private n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private growth: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private rot: Float32Array;
  private vrot: Float32Array;
  private alpha: Float32Array;
  private kind: Uint8Array;
  private color: Uint16Array;
  private colors: string[] = [];
  private colorIndex = new Map<string, number>();
  private dots = new Map<string, HTMLCanvasElement>();
  budget: number;

  constructor(capacity = 600) {
    this.cap = capacity;
    this.budget = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.growth = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.vrot = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.color = new Uint16Array(capacity);
  }

  get count(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
  }

  private colorId(c: string): number {
    let id = this.colorIndex.get(c);
    if (id === undefined) {
      id = this.colors.length;
      this.colors.push(c);
      this.colorIndex.set(c, id);
    }
    return id;
  }

  emit(o: EmitOpts): void {
    const count = o.count ?? 1;
    const cid = this.colorId(o.color);
    for (let k = 0; k < count; k++) {
      if (this.n >= Math.min(this.cap, this.budget)) return;
      const i = this.n++;
      const ang = (o.angle ?? Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 2) * (0.5 + Math.random() * 0.7);
      this.x[i] = o.x + (Math.random() - 0.5) * 0.1;
      this.y[i] = o.y + (Math.random() - 0.5) * 0.1;
      this.vx[i] = (o.vx ?? 0) + Math.cos(ang) * sp;
      this.vy[i] = (o.vy ?? 0) + Math.sin(ang) * sp;
      const life = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = (o.size ?? 0.2) * (0.7 + Math.random() * 0.6);
      this.growth[i] = o.growth ?? 0;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1;
      this.rot[i] = Math.random() * Math.PI * 2;
      this.vrot[i] = (o.spin ?? 0) * (Math.random() - 0.5) * 2;
      this.alpha[i] = o.alpha ?? 1;
      this.kind[i] = o.kind;
      this.color[i] = cid;
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        this.copy(this.n, i);
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.size[i] += this.growth[i] * dt;
      this.rot[i] += this.vrot[i] * dt;
      i++;
    }
  }

  private copy(from: number, to: number): void {
    this.x[to] = this.x[from];
    this.y[to] = this.y[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.growth[to] = this.growth[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.rot[to] = this.rot[from];
    this.vrot[to] = this.vrot[from];
    this.alpha[to] = this.alpha[from];
    this.kind[to] = this.kind[from];
    this.color[to] = this.color[from];
  }

  private dot(color: string): HTMLCanvasElement {
    let d = this.dots.get(color);
    if (!d) {
      d = buildSoftDot(color);
      this.dots.set(color, d);
    }
    return d;
  }

  /** Draw in a y-up world transform. */
  render(ctx: CanvasRenderingContext2D, minX: number, maxX: number): void {
    const prevComp = ctx.globalCompositeOperation;
    for (let pass = 0; pass < 2; pass++) {
      // pass 0: normal blending, pass 1: additive glow types
      ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
      for (let i = 0; i < this.n; i++) {
        const k = this.kind[i];
        const additive = k === PK.Spark || k === PK.Flame || k === PK.Glow || k === PK.Sparkle;
        if ((pass === 1) !== additive) continue;
        const x = this.x[i];
        if (x < minX || x > maxX) continue;
        const y = this.y[i];
        const t = this.life[i] / this.maxLife[i];
        const s = this.size[i];
        const col = this.colors[this.color[i]];
        ctx.globalAlpha = this.alpha[i] * (k === PK.Debris || k === PK.Confetti ? Math.min(1, t * 3) : t);
        switch (k) {
          case PK.Dust:
          case PK.Smoke:
          case PK.Flame:
          case PK.Glow: {
            const img = this.dot(col);
            ctx.drawImage(img, x - s, y - s, s * 2, s * 2);
            break;
          }
          case PK.Spark: {
            ctx.strokeStyle = col;
            ctx.lineWidth = s;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - this.vx[i] * 0.03, y - this.vy[i] * 0.03);
            ctx.stroke();
            break;
          }
          case PK.Debris:
          case PK.Confetti: {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(this.rot[i]);
            ctx.fillStyle = col;
            const sx = k === PK.Confetti ? s * Math.cos(this.rot[i] * 2) : s;
            ctx.fillRect(-sx / 2, -s / 2, sx, s * (k === PK.Confetti ? 0.6 : 1));
            ctx.restore();
            break;
          }
          case PK.Sparkle: {
            ctx.fillStyle = col;
            const r = s * (0.6 + 0.4 * Math.sin(t * 20));
            ctx.beginPath();
            ctx.moveTo(x, y + r);
            ctx.lineTo(x + r * 0.25, y + r * 0.25);
            ctx.lineTo(x + r, y);
            ctx.lineTo(x + r * 0.25, y - r * 0.25);
            ctx.lineTo(x, y - r);
            ctx.lineTo(x - r * 0.25, y - r * 0.25);
            ctx.lineTo(x - r, y);
            ctx.lineTo(x - r * 0.25, y + r * 0.25);
            ctx.closePath();
            ctx.fill();
            break;
          }
          case PK.Bubble: {
            ctx.strokeStyle = col;
            ctx.lineWidth = s * 0.15;
            ctx.beginPath();
            ctx.arc(x, y, s, 0, Math.PI * 2);
            ctx.stroke();
            break;
          }
          case PK.Heart: {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(x, y - s * 0.8);
            ctx.bezierCurveTo(x - s * 1.2, y + s * 0.1, x - s * 0.5, y + s * 0.9, x, y + s * 0.35);
            ctx.bezierCurveTo(x + s * 0.5, y + s * 0.9, x + s * 1.2, y + s * 0.1, x, y - s * 0.8);
            ctx.fill();
            break;
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevComp;
  }
}
