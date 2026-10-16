import { COSMETIC_BY_ID } from '../data/cosmetics';
import type { CosmeticSlot, VehicleDef, VehiclePhysicsDef } from '../data/types';
import { damp } from '../core/math';
import { ANCHORS, drawAccessory, drawBody, drawDriver, drawInterior, drawWheel } from './VehicleArt';
import { createCanvas } from './Sprites';
import { shade } from './color';

export interface VehicleLook {
  paint: string;
  decal: string;
  wheels: string;
  accessory: string;
  trail: string;
  exhaust: string;
}

export const resolveLook = (def: VehicleDef, loadout: Record<CosmeticSlot, string>): VehicleLook => {
  const v = (slot: CosmeticSlot) => COSMETIC_BY_ID[loadout[slot]]?.value ?? 'none';
  const paint = v('paint');
  return {
    paint: paint === 'default' || paint === 'none' ? def.defaultPaint : paint,
    decal: v('decal'),
    wheels: v('wheels'),
    accessory: v('accessory'),
    trail: v('trail'),
    exhaust: v('exhaust'),
  };
};

interface SpriteImg {
  canvas: HTMLCanvasElement;
  x0: number;
  y1: number;
}

export interface VehiclePose {
  x: number;
  y: number;
  a: number;
  rx: number;
  ry: number;
  ra: number;
  fx: number;
  fy: number;
  fa: number;
}

/**
 * Draws a vehicle from cached sprites (body, interior, wheels) plus a few
 * dynamic parts: suspension struts, a bobbing driver and accessories.
 */
export class VehicleRenderer {
  private body: SpriteImg;
  private interior: SpriteImg;
  private rearWheel: SpriteImg;
  private frontWheel: SpriteImg;
  private ppm: number;
  // driver head spring (visual only)
  private headX = 0;
  private headY = 0;
  private headVX = 0;
  private headVY = 0;
  private lastVX = 0;
  private lastVY = 0;
  lean = 0;
  braking = false;
  night = false;

  constructor(readonly def: VehicleDef, readonly tuning: VehiclePhysicsDef, readonly look: VehicleLook, ppm = 110) {
    this.ppm = ppm;
    const a = ANCHORS[def.style];
    const [bx0, by0, bx1, by1] = a.bounds;
    this.body = this.bake(bx0, by0, bx1, by1, (ctx) => drawBody(ctx, def.style, look.paint, look.decal));
    this.interior = this.bake(bx0, by0, bx1, by1, (ctx) => drawInterior(ctx, def.style));
    const mkWheel = (r: number) => this.bake(-r - 0.02, -r - 0.02, r + 0.02, r + 0.02, (ctx) => drawWheel(ctx, r, look.wheels, shade(look.paint, 0.2)));
    this.rearWheel = mkWheel(tuning.rearWheel.radius);
    this.frontWheel = mkWheel(tuning.frontWheel.radius);
  }

  private bake(x0: number, y0: number, x1: number, y1: number, draw: (ctx: CanvasRenderingContext2D) => void): SpriteImg {
    const ppm = this.ppm;
    const c = createCanvas((x1 - x0) * ppm, (y1 - y0) * ppm);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(ppm, 0, 0, -ppm, -x0 * ppm, y1 * ppm);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    draw(ctx);
    return { canvas: c, x0, y1 };
  }

  private blit(ctx: CanvasRenderingContext2D, s: SpriteImg, x: number, y: number, a: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(1 / this.ppm, -1 / this.ppm);
    ctx.drawImage(s.canvas, s.x0 * this.ppm, -s.y1 * this.ppm);
    ctx.restore();
  }

  /** Update the driver's secondary motion from chassis velocity. */
  animate(dt: number, vx: number, vy: number, angle: number): void {
    if (dt <= 0) return;
    const ax = (vx - this.lastVX) / dt;
    const ay = (vy - this.lastVY) / dt;
    this.lastVX = vx;
    this.lastVY = vy;
    // acceleration in the car's frame pushes the head the other way
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    const lax = ax * c - ay * s;
    const lay = ax * s + ay * c;
    const k = 140;
    const d = 12;
    this.headVX += (-this.headX * k - this.headVX * d - Math.max(-40, Math.min(40, lax)) * 0.9) * dt;
    this.headVY += (-this.headY * k - this.headVY * d - Math.max(-40, Math.min(40, lay)) * 0.6) * dt;
    this.headX += this.headVX * dt;
    this.headY += this.headVY * dt;
    this.headX = Math.max(-0.09, Math.min(0.09, this.headX));
    this.headY = Math.max(-0.07, Math.min(0.07, this.headY));
    this.lean = damp(this.lean, this.headX * 4, 10, dt);
  }

  render(ctx: CanvasRenderingContext2D, p: VehiclePose, time: number, speed: number): void {
    const t = this.tuning;
    const a = ANCHORS[this.def.style];
    const cos = Math.cos(p.a);
    const sin = Math.sin(p.a);
    const toWorld = (lx: number, ly: number): [number, number] => [p.x + lx * cos - ly * sin, p.y + lx * sin + ly * cos];

    // Headlight beam at night
    if (this.night) {
      const [hx, hy] = toWorld(a.headlight[0], a.headlight[1]);
      const [ex, ey] = toWorld(a.headlight[0] + 7, a.headlight[1] - 1.2);
      const g = ctx.createLinearGradient(hx, hy, ex, ey);
      g.addColorStop(0, 'rgba(255,244,190,0.42)');
      g.addColorStop(1, 'rgba(255,244,190,0)');
      ctx.fillStyle = g;
      const [ax1, ay1] = toWorld(a.headlight[0] + 7, a.headlight[1] + 0.9);
      const [ax2, ay2] = toWorld(a.headlight[0] + 7, a.headlight[1] - 2.2);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(ax1, ay1);
      ctx.lineTo(ax2, ay2);
      ctx.closePath();
      ctx.fill();
    }

    // Suspension struts
    ctx.lineCap = 'round';
    for (const [w, wx, wy] of [[t.rearWheel, p.rx, p.ry], [t.frontWheel, p.fx, p.fy]] as const) {
      const [sx, sy] = toWorld(w.x, w.y + w.radius + a.strutTop);
      ctx.strokeStyle = '#2b2a38';
      ctx.lineWidth = 0.16;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(wx, wy);
      ctx.stroke();
      ctx.strokeStyle = '#9aa0b4';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo((sx + wx) / 2, (sy + wy) / 2);
      ctx.stroke();
      if (this.def.style === 'monster' || this.def.style === 'buggy') {
        // visible coil spring
        const n = 6;
        ctx.strokeStyle = '#ffcf3f';
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const x = sx + (wx - sx) * k * 0.8 + (i % 2 ? 0.09 : -0.09) * cos;
          const y = sy + (wy - sy) * k * 0.8 + (i % 2 ? 0.09 : -0.09) * sin;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Interior, driver, body
    this.blit(ctx, this.interior, p.x, p.y, p.a);
    const [dx, dy] = toWorld(a.driver[0] + this.headX, a.driver[1] + this.headY);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(p.a + this.lean * 0.5);
    drawDriver(ctx, '#ffffff', this.lean);
    ctx.restore();
    this.blit(ctx, this.body, p.x, p.y, p.a);

    // Brake lights glow
    if (this.braking) {
      const [bx, by] = toWorld(a.bounds[0] + 0.12, 0.2);
      const g = ctx.createRadialGradient(bx, by, 0.02, bx, by, 0.45);
      g.addColorStop(0, 'rgba(255,60,60,0.9)');
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx - 0.5, by - 0.5, 1, 1);
    }

    // Accessory
    if (this.look.accessory !== 'none') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      drawAccessory(ctx, this.def.style, this.look.accessory, this.look.paint, time, speed);
      ctx.restore();
    }

    // Wheels on top
    this.blit(ctx, this.rearWheel, p.rx, p.ry, p.ra);
    this.blit(ctx, this.frontWheel, p.fx, p.fy, p.fa);
  }

  /** Local anchor in world space for FX (exhaust etc). */
  anchorWorld(p: VehiclePose, name: 'exhaust' | 'headlight' | 'roof'): [number, number] {
    const a = ANCHORS[this.def.style][name];
    const cos = Math.cos(p.a);
    const sin = Math.sin(p.a);
    return [p.x + a[0] * cos - a[1] * sin, p.y + a[0] * sin + a[1] * cos];
  }
}
