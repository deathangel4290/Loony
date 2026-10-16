import type { VehicleDef, WorldDef } from '../data/types';
import { applyUpgrades, defaultUpgradeLevels } from '../data/upgrades';
import { BackgroundRenderer } from '../render/BackgroundRenderer';
import { VehicleRenderer, type VehicleLook, type VehiclePose } from '../render/VehicleRenderer';
import { drawWheel } from '../render/VehicleArt';
import { ANCHORS } from '../render/VehicleArt';

const restPose = (def: VehicleDef, bob = 0, spin = 0, tilt = 0): VehiclePose => {
  const p = def.physics;
  const sag = 0.04;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const w = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const [rx, ry] = w(p.rearWheel.x, p.rearWheel.y + sag);
  const [fx, fy] = w(p.frontWheel.x, p.frontWheel.y + sag);
  return { x: 0, y: bob, a: tilt, rx, ry: ry, ra: spin, fx, fy: fy, fa: spin };
};

/** Fit a vehicle into a canvas: returns pixels-per-meter and origin. */
const fit = (def: VehicleDef, w: number, h: number, margin = 0.12) => {
  const [x0, , x1, y1] = ANCHORS[def.style].bounds;
  const bottom = Math.min(def.physics.rearWheel.y - def.physics.rearWheel.radius, def.physics.frontWheel.y - def.physics.frontWheel.radius);
  const top = y1 + 0.35;
  const ppm = Math.min((w * (1 - margin * 2)) / (x1 - x0 + 0.3), (h * (1 - margin * 2)) / (top - bottom));
  const cx = w / 2 - ((x0 + x1) / 2) * ppm;
  const cy = h * (1 - margin) + bottom * ppm;
  return { ppm, cx, cy, bottom };
};

/** Static vehicle thumbnail for cards. */
export const renderVehicleThumb = (canvas: HTMLCanvasElement, def: VehicleDef, look: VehicleLook): void => {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 260;
  const h = canvas.clientHeight || 120;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  const r = new VehicleRenderer(def, def.physics, look, 90);
  const f = fit(def, canvas.width, canvas.height);
  ctx.setTransform(f.ppm, 0, 0, -f.ppm, f.cx, f.cy);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, f.bottom, 1.9, 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  r.render(ctx, restPose(def), 0, 0);
};

/** Small wheel swatch for the cosmetics grid. */
export const renderWheelSwatch = (canvas: HTMLCanvasElement, style: string, accent: string): void => {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 64 * dpr;
  canvas.height = 44 * dpr;
  const ctx = canvas.getContext('2d')!;
  const s = 20 * dpr;
  ctx.setTransform(s, 0, 0, -s, canvas.width / 2, canvas.height / 2);
  drawWheel(ctx, 0.95, style, accent);
};

/** Live, animated garage preview on a little turntable. */
export class VehiclePreview {
  private renderer: VehicleRenderer | null = null;
  private def: VehicleDef | null = null;
  private time = 0;
  private bounce = 0;
  private sparkle = 0;

  constructor(private canvas: HTMLCanvasElement) {}

  set(def: VehicleDef, look: VehicleLook): void {
    this.def = def;
    this.renderer = new VehicleRenderer(def, applyUpgrades(def.physics, defaultUpgradeLevels()), look, 120);
  }

  celebrate(): void {
    this.bounce = 1;
    this.sparkle = 1;
  }

  render(dt: number): void {
    const c = this.canvas;
    if (!this.renderer || !this.def || !c.isConnected) return;
    this.time += dt;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (w === 0 || h === 0) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const f = fit(this.def, w, h, 0.1);
    // platform
    ctx.setTransform(f.ppm, 0, 0, -f.ppm, f.cx, f.cy);
    const grad = ctx.createRadialGradient(0, f.bottom, 0.2, 0, f.bottom, 2.6);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, f.bottom - 0.05, 2.6, 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, f.bottom - 0.02, 1.9, 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    this.bounce = Math.max(0, this.bounce - dt * 1.8);
    const hop = Math.sin(this.bounce * Math.PI) * 0.35;
    const idle = Math.sin(this.time * 7) * 0.012;
    const tilt = Math.sin(this.bounce * Math.PI * 2) * 0.06;
    const pose = restPose(this.def, idle + hop, -this.time * 2.2, tilt);
    // the whole car hops; the idle bob only moves the body on its springs
    pose.ry += hop;
    pose.fy += hop;
    this.renderer.animate(dt, 0, idle * 4, 0);
    this.renderer.render(ctx, pose, this.time, 0);
    if (this.sparkle > 0) {
      this.sparkle = Math.max(0, this.sparkle - dt);
      ctx.fillStyle = `rgba(255,236,150,${this.sparkle})`;
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63 + this.time;
        const r = 1.2 + (1 - this.sparkle) * 1.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 1.4, 0.5 + Math.sin(a) * r * 0.6, 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

const worldThumbs = new Map<string, HTMLCanvasElement>();

/** World thumbnail: parallax backdrop plus a sample of that world's ground. */
export const renderWorldThumb = (canvas: HTMLCanvasElement, world: WorldDef): void => {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round((canvas.clientWidth || 280) * dpr);
  const h = Math.round((canvas.clientHeight || 130) * dpr);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const key = `${world.id}:${w}x${h}`;
  let cached = worldThumbs.get(key);
  if (!cached) {
    cached = document.createElement('canvas');
    cached.width = w;
    cached.height = h;
    const c = cached.getContext('2d')!;
    const bg = new BackgroundRenderer(world, 'medium');
    bg.resize(w, h);
    bg.render(c, 30, 0, h / 10, 0);
    const p = world.palette;
    const ground = (x: number) => h * (0.78 + Math.sin(x / w * 5 + 1) * 0.06 + Math.sin(x / w * 13) * 0.02);
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) c.lineTo(x, ground(x));
    c.lineTo(w, h);
    c.closePath();
    c.fillStyle = p.dirt;
    c.fill();
    c.lineWidth = h * 0.06;
    c.strokeStyle = p.surface;
    c.beginPath();
    for (let x = 0; x <= w; x += 4) (x ? c.lineTo(x, ground(x)) : c.moveTo(x, ground(x)));
    c.stroke();
    worldThumbs.set(key, cached);
  }
  ctx.drawImage(cached, 0, 0);
};
