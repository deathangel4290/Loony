import { Random } from '../core/Random';
import type { DecorKind, PropKind, WorldDef } from '../data/types';
import { rgba, shade } from './color';

/** A pre-rendered sprite with its anchor (bottom-center unless noted) in meters. */
export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size in meters. */
  w: number;
  h: number;
  /** Anchor offset in meters from the left/bottom of the sprite. */
  ax: number;
  ay: number;
  ppm: number;
}

type Ctx = CanvasRenderingContext2D;

export const createCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

/**
 * Renders art in meter units (y-up, origin at anchor) into a canvas sprite.
 * `x0,y0,x1,y1` are the art bounds relative to the anchor.
 */
export const makeSprite = (x0: number, y0: number, x1: number, y1: number, ppm: number, draw: (ctx: Ctx) => void): Sprite => {
  const w = x1 - x0;
  const h = y1 - y0;
  const canvas = createCanvas(w * ppm, h * ppm);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ppm, 0, 0, -ppm, -x0 * ppm, y1 * ppm);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return { canvas, w, h, ax: -x0, ay: -y0, ppm };
};

/** Draw a sprite in a y-up world transform at (x, y) with rotation. */
export const drawSprite = (ctx: Ctx, s: Sprite, x: number, y: number, angle = 0, scale = 1, flip = false): void => {
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  const k = scale / s.ppm;
  ctx.scale(flip ? -k : k, -k);
  ctx.drawImage(s.canvas, -s.ax * s.ppm, -(s.h - s.ay) * s.ppm);
  ctx.restore();
};

const OUT = '#1c1b2e';

const blob = (ctx: Ctx, cx: number, cy: number, r: number, color: string, rng: Random, bumps = 7) => {
  ctx.beginPath();
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const rr = r * (0.82 + rng.next() * 0.3);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.quadraticCurveTo(cx + Math.cos(a - 0.4) * rr * 1.15, cy + Math.sin(a - 0.4) * rr * 1.05, x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
};

/** Decor art per kind; `v` selects a variant. */
const drawDecor = (ctx: Ctx, kind: DecorKind, w: WorldDef, v: number): [number, number, number, number] | void => {
  const rng = new Random(v * 977 + kind.length * 131);
  const p = w.palette;
  switch (kind) {
    case 'tree': {
      ctx.fillStyle = '#7a4e2e';
      ctx.beginPath();
      ctx.moveTo(-0.16, -0.2);
      ctx.lineTo(0.16, -0.2);
      ctx.lineTo(0.1, 2.2);
      ctx.lineTo(-0.1, 2.2);
      ctx.fill();
      const leaf = shade(p.near, 0.05 + v * 0.05);
      blob(ctx, 0, 2.6, 1.25, shade(leaf, -0.25), rng, 8);
      blob(ctx, -0.45, 2.3, 0.85, leaf, rng, 7);
      blob(ctx, 0.5, 2.5, 0.9, leaf, rng, 7);
      blob(ctx, 0.05, 3.05, 0.85, shade(leaf, 0.15), rng, 7);
      ctx.fillStyle = rgba('#ffffff', 0.18);
      ctx.beginPath();
      ctx.arc(-0.25, 3.2, 0.32, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'bush':
      blob(ctx, 0, 0.35, 0.6, shade(p.near, -0.1), rng, 7);
      blob(ctx, 0.35, 0.45, 0.45, p.near, rng, 6);
      blob(ctx, -0.3, 0.4, 0.42, shade(p.near, 0.1), rng, 6);
      return;
    case 'flower': {
      const colors = ['#ff5a8a', '#ffd23f', '#ffffff', '#9b5de5'];
      for (let i = 0; i < 3; i++) {
        const x = -0.25 + i * 0.25;
        const hgt = 0.3 + rng.next() * 0.25;
        ctx.strokeStyle = '#3c8d2f';
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.moveTo(x, -0.1);
        ctx.lineTo(x + 0.03, hgt);
        ctx.stroke();
        ctx.fillStyle = colors[(v + i) % colors.length];
        ctx.beginPath();
        ctx.arc(x + 0.03, hgt, 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffcf33';
        ctx.beginPath();
        ctx.arc(x + 0.03, hgt, 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case 'rock':
    case 'snowrock': {
      const base = kind === 'snowrock' ? '#8d9db8' : w.id === 'volcano' ? '#3b3236' : '#9a948c';
      ctx.beginPath();
      ctx.moveTo(-0.7, -0.15);
      ctx.lineTo(-0.55, 0.35);
      ctx.lineTo(-0.15, 0.62 + v * 0.1);
      ctx.lineTo(0.35, 0.5);
      ctx.lineTo(0.7, 0.1);
      ctx.lineTo(0.62, -0.15);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      ctx.strokeStyle = shade(base, -0.4);
      ctx.lineWidth = 0.04;
      ctx.stroke();
      ctx.fillStyle = shade(base, 0.2);
      ctx.beginPath();
      ctx.moveTo(-0.5, 0.33);
      ctx.lineTo(-0.15, 0.58 + v * 0.1);
      ctx.lineTo(0.05, 0.3);
      ctx.closePath();
      ctx.fill();
      if (kind === 'snowrock') {
        ctx.fillStyle = '#f4f9ff';
        ctx.beginPath();
        ctx.moveTo(-0.58, 0.3);
        ctx.quadraticCurveTo(-0.2, 0.75, 0.38, 0.48);
        ctx.quadraticCurveTo(0.1, 0.4, -0.58, 0.3);
        ctx.fill();
      }
      return;
    }
    case 'fence':
      ctx.fillStyle = '#c99a63';
      ctx.strokeStyle = '#8a6239';
      ctx.lineWidth = 0.03;
      for (const x of [-0.9, 0, 0.9]) {
        ctx.fillRect(x - 0.06, -0.2, 0.12, 0.95);
        ctx.strokeRect(x - 0.06, -0.2, 0.12, 0.95);
      }
      ctx.fillRect(-1.0, 0.25, 2.0, 0.1);
      ctx.fillRect(-1.0, 0.55, 2.0, 0.1);
      return;
    case 'cactus': {
      const c = '#3f9d4f';
      ctx.fillStyle = c;
      ctx.strokeStyle = shade(c, -0.35);
      ctx.lineWidth = 0.05;
      const arm = (x: number, y: number, dir: number, h: number) => {
        ctx.beginPath();
        ctx.roundRect(x, y, 0.22 * dir, 0.22, 0.1);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x + 0.22 * dir - (dir > 0 ? 0.22 : 0), y, 0.22, h, 0.11);
        ctx.fill();
        ctx.stroke();
      };
      arm(0.15, 0.9 + v * 0.1, 1, 0.8);
      arm(-0.15, 1.3, -1, 0.6);
      ctx.beginPath();
      ctx.roundRect(-0.18, -0.2, 0.36, 2.4 + v * 0.3, 0.18);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.25);
      ctx.beginPath();
      ctx.moveTo(-0.06, 0);
      ctx.lineTo(-0.06, 2.2);
      ctx.stroke();
      return;
    }
    case 'mesa': {
      ctx.fillStyle = shade(p.mid, -0.05);
      ctx.beginPath();
      ctx.moveTo(-2.4, -0.3);
      ctx.lineTo(-1.8, 2.2);
      ctx.lineTo(-1.2, 2.6);
      ctx.lineTo(1.0, 2.6);
      ctx.lineTo(1.7, 2.0);
      ctx.lineTo(2.3, -0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(p.mid, 0.15);
      ctx.fillRect(-1.6, 1.6, 3.0, 0.18);
      ctx.fillRect(-1.95, 0.8, 3.9, 0.14);
      return;
    }
    case 'skull':
      ctx.fillStyle = '#f2e6d0';
      ctx.beginPath();
      ctx.ellipse(0, 0.2, 0.3, 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a4630';
      ctx.beginPath();
      ctx.arc(-0.1, 0.24, 0.06, 0, Math.PI * 2);
      ctx.arc(0.1, 0.24, 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f2e6d0';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(-0.25, 0.32);
      ctx.quadraticCurveTo(-0.6, 0.5, -0.55, 0.75);
      ctx.moveTo(0.25, 0.32);
      ctx.quadraticCurveTo(0.6, 0.5, 0.55, 0.75);
      ctx.stroke();
      return;
    case 'tumble':
      ctx.strokeStyle = '#a5763f';
      ctx.lineWidth = 0.035;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        ctx.arc(0, 0.42, 0.2 + rng.next() * 0.25, rng.next() * 6, rng.next() * 6 + 2);
        ctx.stroke();
      }
      return;
    case 'pine': {
      ctx.fillStyle = '#5b3d2b';
      ctx.fillRect(-0.12, -0.2, 0.24, 0.8);
      const g = shade('#2f6b57', v * 0.06);
      for (let i = 0; i < 4; i++) {
        const y = 0.5 + i * 0.75;
        const wdt = 1.3 - i * 0.26;
        ctx.fillStyle = shade(g, i * 0.05);
        ctx.beginPath();
        ctx.moveTo(-wdt, y);
        ctx.lineTo(0, y + 1.25);
        ctx.lineTo(wdt, y);
        ctx.closePath();
        ctx.fill();
        if (w.id === 'snow') {
          ctx.fillStyle = '#f4f9ff';
          ctx.beginPath();
          ctx.moveTo(-wdt * 0.55, y + 0.55);
          ctx.lineTo(0, y + 1.25);
          ctx.lineTo(wdt * 0.55, y + 0.55);
          ctx.quadraticCurveTo(0, y + 0.75, -wdt * 0.55, y + 0.55);
          ctx.fill();
        }
      }
      return;
    }
    case 'snowman':
      ctx.fillStyle = '#f7fbff';
      ctx.strokeStyle = '#b8c9e0';
      ctx.lineWidth = 0.04;
      for (const [y, r] of [[0.3, 0.42], [0.95, 0.3], [1.42, 0.22]] as const) {
        ctx.beginPath();
        ctx.arc(0, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#ff8c1a';
      ctx.beginPath();
      ctx.moveTo(0.05, 1.42);
      ctx.lineTo(0.35, 1.38);
      ctx.lineTo(0.05, 1.36);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-0.2, 1.6, 0.4, 0.06);
      ctx.fillRect(-0.13, 1.64, 0.26, 0.24);
      return;
    case 'lamp': {
      ctx.fillStyle = '#2d3048';
      ctx.fillRect(-0.06, -0.2, 0.12, 3.6);
      ctx.fillRect(-0.06, 3.3, 0.7, 0.1);
      ctx.fillStyle = '#ffe9a3';
      ctx.beginPath();
      ctx.ellipse(0.55, 3.22, 0.18, 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(0.55, 3.0, 0.05, 0.55, 2.6, 1.6);
      g.addColorStop(0, 'rgba(255,233,163,0.45)');
      g.addColorStop(1, 'rgba(255,233,163,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0.4, 3.2);
      ctx.lineTo(0.7, 3.2);
      ctx.lineTo(1.6, 0);
      ctx.lineTo(-0.5, 0);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'sign': {
      ctx.fillStyle = '#2d3048';
      ctx.fillRect(-0.05, -0.2, 0.1, 2.0);
      const colors = ['#ff3df2', '#3dfcff', '#ffe14d'];
      ctx.fillStyle = '#1a1c33';
      ctx.fillRect(-0.7, 1.8, 1.4, 0.7);
      ctx.strokeStyle = colors[v % 3];
      ctx.lineWidth = 0.06;
      ctx.strokeRect(-0.62, 1.88, 1.24, 0.54);
      ctx.fillStyle = colors[(v + 1) % 3];
      for (let i = 0; i < 3; i++) ctx.fillRect(-0.45 + i * 0.32, 2.05, 0.22, 0.2);
      return;
    }
    case 'hydrant':
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.roundRect(-0.14, -0.1, 0.28, 0.6, 0.06);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0.52, 0.14, Math.PI, 0, true);
      ctx.fill();
      ctx.fillRect(-0.22, 0.22, 0.44, 0.1);
      return;
    case 'bin':
      ctx.fillStyle = '#3c8d5a';
      ctx.beginPath();
      ctx.roundRect(-0.3, -0.1, 0.6, 0.85, 0.05);
      ctx.fill();
      ctx.fillStyle = shade('#3c8d5a', -0.3);
      ctx.fillRect(-0.34, 0.72, 0.68, 0.1);
      return;
    case 'deadtree':
      ctx.strokeStyle = '#1b1416';
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.22;
      ctx.beginPath();
      ctx.moveTo(0, -0.2);
      ctx.lineTo(0.1, 1.8);
      ctx.stroke();
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(0.05, 1.0);
      ctx.lineTo(-0.7, 1.9);
      ctx.moveTo(0.08, 1.4);
      ctx.lineTo(0.8, 2.3);
      ctx.moveTo(0.1, 1.8);
      ctx.lineTo(0.0, 2.6);
      ctx.moveTo(-0.4, 1.55);
      ctx.lineTo(-0.5, 2.1);
      ctx.stroke();
      return;
    case 'vent': {
      ctx.fillStyle = '#2b2326';
      ctx.beginPath();
      ctx.moveTo(-0.8, -0.2);
      ctx.lineTo(-0.3, 0.7);
      ctx.lineTo(0.3, 0.7);
      ctx.lineTo(0.8, -0.2);
      ctx.closePath();
      ctx.fill();
      const g = ctx.createRadialGradient(0, 0.7, 0.02, 0, 0.7, 0.35);
      g.addColorStop(0, '#ffd166');
      g.addColorStop(0.5, '#ff6b1a');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0.7, 0.35, 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'moonrock': {
      ctx.fillStyle = '#9a9eae';
      ctx.beginPath();
      ctx.moveTo(-0.8, -0.15);
      ctx.quadraticCurveTo(-0.7, 0.55 + v * 0.1, -0.1, 0.6 + v * 0.12);
      ctx.quadraticCurveTo(0.6, 0.55, 0.8, -0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7d8192';
      for (const [x, y, r] of [[-0.35, 0.25, 0.12], [0.2, 0.35, 0.09], [0.4, 0.1, 0.07]] as const) {
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(-0.3, 0.45, 0.25, 0.08, -0.3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'dish': {
      ctx.strokeStyle = '#5d6178';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(-0.5, -0.2);
      ctx.lineTo(0, 1.2);
      ctx.lineTo(0.5, -0.2);
      ctx.moveTo(0, -0.2);
      ctx.lineTo(0, 1.2);
      ctx.stroke();
      ctx.save();
      ctx.translate(0, 1.4);
      ctx.rotate(0.5);
      ctx.fillStyle = '#e6e9f2';
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.9, 0.32, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#a7abb9';
      ctx.lineWidth = 0.04;
      ctx.stroke();
      ctx.strokeStyle = '#5d6178';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 0.6);
      ctx.stroke();
      ctx.fillStyle = '#ff3d6e';
      ctx.beginPath();
      ctx.arc(0, 0.62, 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'lander': {
      ctx.strokeStyle = '#8b8fa3';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(-0.5, 0.6);
      ctx.lineTo(-0.95, -0.2);
      ctx.moveTo(0.5, 0.6);
      ctx.lineTo(0.95, -0.2);
      ctx.stroke();
      ctx.fillStyle = '#e8b931';
      ctx.fillRect(-0.6, 0.45, 1.2, 0.55);
      ctx.fillStyle = '#c99a1f';
      for (let i = 0; i < 4; i++) ctx.fillRect(-0.55 + i * 0.3, 0.5, 0.12, 0.45);
      ctx.fillStyle = '#d4d8e2';
      ctx.beginPath();
      ctx.moveTo(-0.45, 1.0);
      ctx.lineTo(-0.35, 1.55);
      ctx.lineTo(0.4, 1.55);
      ctx.lineTo(0.5, 1.0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1c2541';
      ctx.fillRect(-0.12, 1.2, 0.24, 0.18);
      ctx.fillStyle = '#5d6178';
      ctx.fillRect(-1.05, -0.24, 0.25, 0.06);
      ctx.fillRect(0.8, -0.24, 0.25, 0.06);
      return;
    }
    case 'moonflag': {
      ctx.fillStyle = '#d4d8e2';
      ctx.fillRect(-0.04, -0.2, 0.08, 2.0);
      ctx.fillStyle = '#ff3d6e';
      ctx.fillRect(0.04, 1.25, 0.95, 0.55);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0.5, 1.52, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0.04, 1.25, 0.95, 0.07);
      return;
    }
    case 'crystal': {
      const c = v % 2 ? '#ff6b1a' : '#ff3d6e';
      for (const [x, h, a] of [[-0.2, 0.9, -0.25], [0.15, 1.3, 0.1], [0.4, 0.7, 0.4]] as const) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(-a);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-0.12, -0.1);
        ctx.lineTo(-0.12, h - 0.2);
        ctx.lineTo(0, h);
        ctx.lineTo(0.12, h - 0.2);
        ctx.lineTo(0.12, -0.1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-0.08, 0, 0.05, h - 0.3);
        ctx.restore();
      }
      return;
    }
  }
};

const DECOR_BOUNDS: Partial<Record<DecorKind, [number, number, number, number]>> = {
  tree: [-1.6, -0.3, 1.6, 4.1],
  bush: [-1.0, -0.2, 1.0, 1.1],
  flower: [-0.45, -0.2, 0.45, 0.7],
  rock: [-0.8, -0.25, 0.8, 0.85],
  snowrock: [-0.8, -0.25, 0.8, 0.9],
  fence: [-1.1, -0.25, 1.1, 0.85],
  cactus: [-0.75, -0.25, 0.75, 3.0],
  mesa: [-2.5, -0.35, 2.4, 2.7],
  skull: [-0.7, -0.1, 0.7, 0.85],
  tumble: [-0.55, -0.1, 0.55, 0.95],
  pine: [-1.4, -0.25, 1.4, 4.1],
  snowman: [-0.5, -0.15, 0.5, 1.95],
  lamp: [-0.6, -0.25, 1.7, 3.6],
  sign: [-0.75, -0.25, 0.75, 2.55],
  hydrant: [-0.3, -0.15, 0.3, 0.7],
  bin: [-0.4, -0.15, 0.4, 0.9],
  deadtree: [-0.9, -0.25, 1.0, 2.8],
  vent: [-0.85, -0.25, 0.85, 1.0],
  crystal: [-0.6, -0.15, 0.8, 1.4],
  moonrock: [-0.85, -0.2, 0.85, 0.85],
  dish: [-1.0, -0.25, 1.1, 2.3],
  lander: [-1.1, -0.3, 1.1, 1.65],
  moonflag: [-0.1, -0.25, 1.05, 1.9],
};

export const DECOR_VARIANTS = 3;

export const buildDecorSprites = (world: WorldDef, ppm: number): Map<string, Sprite> => {
  const map = new Map<string, Sprite>();
  for (const kind of new Set(world.decor)) {
    const b = DECOR_BOUNDS[kind] ?? [-1, -0.3, 1, 2];
    for (let v = 0; v < DECOR_VARIANTS; v++) {
      map.set(`${kind}:${v}`, makeSprite(b[0], b[1], b[2], b[3], ppm, (ctx) => drawDecor(ctx, kind, world, v)));
    }
  }
  return map;
};

// ---------------------------------------------------------------- props

export const buildPropSprites = (ppm: number): Record<PropKind, Sprite> => {
  const crate = makeSprite(-0.42, -0.42, 0.42, 0.42, ppm, (ctx) => {
    ctx.fillStyle = '#c98b4a';
    ctx.fillRect(-0.4, -0.4, 0.8, 0.8);
    ctx.strokeStyle = '#7b4f24';
    ctx.lineWidth = 0.06;
    ctx.strokeRect(-0.37, -0.37, 0.74, 0.74);
    ctx.beginPath();
    ctx.moveTo(-0.37, -0.37);
    ctx.lineTo(0.37, 0.37);
    ctx.moveTo(-0.37, 0.37);
    ctx.lineTo(0.37, -0.37);
    ctx.stroke();
  });
  const barrel = makeSprite(-0.33, -0.45, 0.33, 0.45, ppm, (ctx) => {
    ctx.fillStyle = '#e94b3c';
    ctx.beginPath();
    ctx.roundRect(-0.31, -0.43, 0.62, 0.86, 0.08);
    ctx.fill();
    ctx.fillStyle = '#b3352a';
    ctx.fillRect(-0.31, -0.2, 0.62, 0.06);
    ctx.fillRect(-0.31, 0.16, 0.62, 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-0.2, -0.4, 0.07, 0.8);
  });
  const cone = makeSprite(-0.3, -0.38, 0.3, 0.4, ppm, (ctx) => {
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.moveTo(-0.27, -0.33);
    ctx.lineTo(0.27, -0.33);
    ctx.lineTo(0.07, 0.38);
    ctx.lineTo(-0.07, 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-0.18, -0.05);
    ctx.lineTo(0.18, -0.05);
    ctx.lineTo(0.13, 0.12);
    ctx.lineTo(-0.13, 0.12);
    ctx.fill();
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(-0.3, -0.38, 0.6, 0.07);
  });
  const snowman = makeSprite(-0.42, -0.52, 0.42, 0.72, ppm, (ctx) => {
    ctx.fillStyle = '#f7fbff';
    ctx.strokeStyle = '#b8c9e0';
    ctx.lineWidth = 0.035;
    for (const [y, r] of [[-0.12, 0.38], [0.42, 0.26]] as const) {
      ctx.beginPath();
      ctx.arc(0, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ff8c1a';
    ctx.beginPath();
    ctx.moveTo(0.05, 0.42);
    ctx.lineTo(0.32, 0.39);
    ctx.lineTo(0.05, 0.36);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-0.06, 0.5, 0.03, 0, 7);
    ctx.arc(0.08, 0.5, 0.03, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e63946';
    ctx.fillRect(-0.24, 0.18, 0.48, 0.08);
  });
  const boulder = makeSprite(-0.65, -0.45, 0.65, 0.48, ppm, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-0.55, -0.4);
    ctx.lineTo(0.5, -0.42);
    ctx.lineTo(0.62, 0.05);
    ctx.lineTo(0.2, 0.45);
    ctx.lineTo(-0.4, 0.38);
    ctx.lineTo(-0.62, 0.0);
    ctx.closePath();
    ctx.fillStyle = '#4a3f44';
    ctx.fill();
    ctx.strokeStyle = '#ff6b1a';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.2);
    ctx.lineTo(0.0, 0.1);
    ctx.lineTo(0.3, -0.05);
    ctx.stroke();
  });
  const hay = makeSprite(-0.62, -0.4, 0.62, 0.4, ppm, (ctx) => {
    ctx.fillStyle = '#e9c46a';
    ctx.beginPath();
    ctx.roundRect(-0.6, -0.375, 1.2, 0.75, 0.12);
    ctx.fill();
    ctx.strokeStyle = '#c99a3a';
    ctx.lineWidth = 0.03;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.55, -0.3 + i * 0.12);
      ctx.lineTo(0.55, -0.3 + i * 0.12 + 0.03);
      ctx.stroke();
    }
    ctx.strokeStyle = '#9c5b2b';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.375);
    ctx.lineTo(-0.3, 0.375);
    ctx.moveTo(0.3, -0.375);
    ctx.lineTo(0.3, 0.375);
    ctx.stroke();
  });
  const tire = makeSprite(-0.38, -0.38, 0.38, 0.38, ppm, (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#23222e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#5c5f6e';
    ctx.fill();
  });
  return { crate, barrel, cone, snowman, boulder, hay, tire };
};

// ---------------------------------------------------------- collectibles

export const COIN_COLORS = [
  ['#ffcf4a', '#d48a0e'],
  ['#e9eef6', '#8f9bb3'],
  ['#ffd84d', '#ff9f1c'],
  ['#c77dff', '#7b2cbf'],
];

export const buildCoinSprites = (ppm: number): Sprite[] =>
  COIN_COLORS.map(([face, rim], tier) =>
    makeSprite(-0.42, -0.42, 0.42, 0.42, ppm, (ctx) => {
      const r = tier === 3 ? 0.4 : 0.34;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = rim;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0.015, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = face;
      ctx.fill();
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = shade(rim, -0.2);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // emblem: a little "L" wheel mark
      ctx.strokeStyle = shade(rim, -0.05);
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.42);
      ctx.lineTo(0, r * 0.42);
      ctx.moveTo(-r * 0.42, 0);
      ctx.lineTo(r * 0.42, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.35, r * 0.4, r * 0.22, r * 0.1, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }),
  );

export const buildFuelSprite = (ppm: number): Sprite =>
  makeSprite(-0.5, -0.55, 0.5, 0.6, ppm, (ctx) => {
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.roundRect(-0.38, -0.5, 0.76, 0.86, 0.1);
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = '#7a1520';
    ctx.stroke();
    // handle
    ctx.beginPath();
    ctx.roundRect(-0.3, 0.34, 0.4, 0.18, 0.06);
    ctx.stroke();
    // spout
    ctx.fillStyle = '#c9ccd6';
    ctx.fillRect(0.16, 0.36, 0.14, 0.18);
    // emblem
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.scale(1, -1);
    ctx.font = 'bold 0.42px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', 0, 0.06);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-0.3, -0.42, 0.08, 0.7);
  });

export const buildSoftDot = (color: string, size = 64): HTMLCanvasElement => {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, rgba(color, 1));
  g.addColorStop(0.45, rgba(color, 0.55));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
};

export { OUT as OUTLINE_COLOR };
