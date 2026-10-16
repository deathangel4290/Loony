import { Random } from '../core/Random';
import type { TimeOfDay, WorldDef } from '../data/types';
import { mix, rgba, shade } from './color';
import { createCanvas } from './Sprites';

interface Layer {
  canvas: HTMLCanvasElement;
  parallax: number;
  /** Screen-height fraction where the layer's baseline sits. */
  base: number;
  /** Color used to fill below the layer. */
  fill: string;
}

/**
 * Parallax backdrop. Every layer is generated procedurally once per world and
 * screen size into a horizontally tileable canvas, so a frame costs only a
 * handful of drawImage calls.
 */
export class BackgroundRenderer {
  private sky: HTMLCanvasElement | null = null;
  private layers: Layer[] = [];
  private clouds: { x: number; y: number; s: number; speed: number; c: HTMLCanvasElement }[] = [];
  private w = 0;
  private h = 0;
  private time: TimeOfDay;
  private layerCount = 3;

  constructor(readonly world: WorldDef, quality: 'low' | 'medium' | 'high', time?: TimeOfDay) {
    this.time = time ?? world.time;
    this.layerCount = quality === 'low' ? 2 : 3;
  }

  setTime(t: TimeOfDay): void {
    this.time = t;
    this.w = 0;
  }

  get timeOfDay(): TimeOfDay {
    return this.time;
  }

  private palette() {
    const p = this.world.palette;
    if (this.time === this.world.time) return p;
    if (this.time === 'night') {
      return { ...p, skyTop: '#0b1030', skyBottom: '#2b2f5e', far: mix(p.far, '#1b2048', 0.65), mid: mix(p.mid, '#161a3a', 0.6), near: mix(p.near, '#12142e', 0.55), fog: '#2b2f5e' };
    }
    if (this.time === 'sunset') {
      return { ...p, skyTop: '#f06a5a', skyBottom: '#ffcf8a', far: mix(p.far, '#c76b5a', 0.45), mid: mix(p.mid, '#a5523f', 0.35), near: mix(p.near, '#7a3b30', 0.3), fog: '#ffcf9e' };
    }
    return { ...p, skyTop: '#4fb8ff', skyBottom: '#d3f2ff', far: mix(p.far, '#a3d9cf', 0.3), fog: '#e6f6ff' };
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const p = this.palette();
    const rng = new Random(this.world.id.length * 9973 + 17);

    // Sky with sun/moon and stars baked in.
    const sky = createCanvas(w, h);
    const sc = sky.getContext('2d')!;
    const g = sc.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(0.7, p.skyBottom);
    g.addColorStop(1, p.fog);
    sc.fillStyle = g;
    sc.fillRect(0, 0, w, h);
    const night = this.time === 'night';
    if (night || this.world.sky === 'smoke') {
      const stars = this.world.sky === 'space' ? 320 : 140;
      for (let i = 0; i < stars; i++) {
        sc.globalAlpha = 0.3 + rng.next() * 0.7;
        sc.fillStyle = '#ffffff';
        const r = rng.next() < 0.9 ? 1 : 2;
        sc.fillRect(rng.next() * w, rng.next() * h * 0.6, r * (h / 600), r * (h / 600));
      }
      sc.globalAlpha = 1;
    }
    const sunX = w * 0.74;
    const sunY = h * (this.time === 'sunset' ? 0.5 : 0.2);
    const sunR = h * (this.time === 'sunset' ? 0.11 : night ? 0.06 : 0.07);
    const glow = sc.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 5);
    glow.addColorStop(0, rgba(p.sun, 0.55));
    glow.addColorStop(1, rgba(p.sun, 0));
    sc.fillStyle = glow;
    sc.fillRect(0, 0, w, h);
    sc.beginPath();
    sc.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    sc.fillStyle = p.sun;
    sc.fill();
    if (this.world.sky === 'space') {
      // Earth, with continents and a soft terminator.
      const r = sunR * 1.25;
      sc.save();
      sc.beginPath();
      sc.arc(sunX, sunY, r, 0, Math.PI * 2);
      sc.fillStyle = '#2f7de1';
      sc.fill();
      sc.clip();
      sc.fillStyle = '#4caf50';
      for (const [dx, dy, rx, ry] of [[-0.35, -0.2, 0.42, 0.28], [0.3, 0.25, 0.35, 0.22], [0.1, -0.55, 0.25, 0.12]] as const) {
        sc.beginPath();
        sc.ellipse(sunX + dx * r, sunY + dy * r, rx * r, ry * r, 0.4, 0, Math.PI * 2);
        sc.fill();
      }
      sc.fillStyle = 'rgba(255,255,255,0.75)';
      sc.beginPath();
      sc.ellipse(sunX - 0.1 * r, sunY + 0.6 * r, 0.5 * r, 0.1 * r, 0.2, 0, Math.PI * 2);
      sc.fill();
      sc.fillStyle = 'rgba(4,5,15,0.55)';
      sc.beginPath();
      sc.arc(sunX + r * 0.55, sunY + r * 0.15, r * 1.05, 0, Math.PI * 2);
      sc.fill();
      sc.restore();
    } else if (night) {
      sc.beginPath();
      sc.arc(sunX + sunR * 0.4, sunY - sunR * 0.2, sunR * 0.85, 0, Math.PI * 2);
      sc.fillStyle = rgba(p.skyTop, 0.55);
      sc.fill();
    }
    if (this.time === 'sunset') {
      sc.fillStyle = rgba('#ffffff', 0.12);
      for (let i = 0; i < 4; i++) sc.fillRect(sunX - sunR * 1.6, sunY + sunR * (0.2 + i * 0.28), sunR * 3.2, sunR * 0.08);
    }
    this.sky = sky;

    // Parallax layers
    const tileW = Math.max(w, 1200);
    this.layers = [];
    const kinds = this.layerCount === 3 ? ['far', 'mid', 'near'] : ['far', 'mid'];
    for (const k of kinds) this.layers.push(this.buildLayer(k as 'far' | 'mid' | 'near', tileW, h, p, rng.fork(k.length)));

    // Clouds
    this.clouds = [];
    if (this.world.sky === 'clouds' || this.world.sky === 'sunset' || this.world.sky === 'aurora') {
      const n = this.world.sky === 'clouds' ? 6 : 4;
      for (let i = 0; i < n; i++) {
        this.clouds.push({ x: rng.next() * tileW, y: h * (0.08 + rng.next() * 0.3), s: 0.6 + rng.next() * 0.8, speed: 4 + rng.next() * 8, c: this.buildCloud(h, rng, this.time === 'sunset' ? '#ffe2c4' : '#ffffff') });
      }
    }
  }

  private buildCloud(h: number, rng: Random, color: string): HTMLCanvasElement {
    const cw = Math.round(h * 0.42);
    const ch = Math.round(h * 0.16);
    const c = createCanvas(cw, ch);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = cw * (0.18 + (i / (n - 1)) * 0.64);
      const r = ch * (0.25 + rng.next() * 0.22) * (i === 2 ? 1.3 : 1);
      ctx.beginPath();
      ctx.arc(x, ch * 0.62 - r * 0.3, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(cw * 0.15, ch * 0.55, cw * 0.7, ch * 0.3);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = rgba('#7c8db5', 0.18);
    ctx.fillRect(0, ch * 0.65, cw, ch);
    return c;
  }

  private buildLayer(kind: 'far' | 'mid' | 'near', tileW: number, h: number, p: ReturnType<BackgroundRenderer['palette']>, rng: Random): Layer {
    const layerH = Math.round(h * (kind === 'far' ? 0.62 : kind === 'mid' ? 0.5 : 0.36));
    const c = createCanvas(tileW, layerH);
    const ctx = c.getContext('2d')!;
    const color = kind === 'far' ? p.far : kind === 'mid' ? p.mid : p.near;
    const sky = this.world.sky;
    const wid = this.world.id;
    // periodic noise so the tile wraps seamlessly
    const waves: [number, number, number][] = [];
    for (let i = 0; i < 5; i++) waves.push([rng.int(1, 4) * (i + 1), rng.next() * Math.PI * 2, (0.5 / (i + 1)) * (0.6 + rng.next() * 0.6)]);
    const ridge = (x: number) => {
      let v = 0;
      for (const [f, ph, a] of waves) v += Math.sin((x / tileW) * Math.PI * 2 * f + ph) * a;
      return v;
    };

    if (sky === 'skyline' && kind !== 'near') {
      // City skyline
      const winColor = kind === 'far' ? rgba('#ffe9a3', 0.25) : rgba('#ffe9a3', 0.7);
      let x = 0;
      while (x < tileW) {
        const bw = (kind === 'far' ? 40 : 70) + rng.next() * (kind === 'far' ? 60 : 110);
        const bh = layerH * (0.3 + rng.next() * (kind === 'far' ? 0.6 : 0.55));
        const ww = Math.min(bw, tileW - x);
        ctx.fillStyle = shade(color, (rng.next() - 0.5) * 0.12);
        ctx.fillRect(x, layerH - bh, ww, bh);
        if (rng.next() < 0.3) ctx.fillRect(x + ww * 0.4, layerH - bh - 18, 4, 18);
        ctx.fillStyle = winColor;
        const cols = Math.floor(ww / 14);
        const rows = Math.floor(bh / 18);
        for (let cx = 0; cx < cols; cx++)
          for (let ry = 0; ry < rows; ry++) if (rng.next() < 0.35) ctx.fillRect(x + 5 + cx * 14, layerH - bh + 8 + ry * 18, 6, 8);
        x += ww + (kind === 'far' ? 2 : 6);
      }
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, layerH);
      const amp = kind === 'far' ? 0.42 : kind === 'mid' ? 0.3 : 0.22;
      const jag = wid === 'snow' || wid === 'volcano' || (wid === 'desert' && kind === 'far');
      for (let x = 0; x <= tileW; x += jag ? 14 : 8) {
        let y = layerH * (0.55 - ridge(x) * amp);
        if (jag) y += (rng.next() - 0.5) * layerH * 0.025;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(tileW, layerH);
      ctx.closePath();
      ctx.fill();
      // snow caps / highlights
      if (wid === 'snow' && kind === 'far') {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = rgba('#ffffff', 0.85);
        ctx.fillRect(0, 0, tileW, layerH * 0.38);
        ctx.restore();
      }
      if (wid === 'desert' && kind === 'mid') {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = rgba('#ffffff', 0.08);
        for (let i = 0; i < 4; i++) ctx.fillRect(0, layerH * (0.45 + i * 0.12), tileW, layerH * 0.025);
        ctx.restore();
      }
      if (wid === 'volcano' && kind === 'far') {
        // a volcano cone with a glowing crater
        const vx = tileW * 0.3;
        ctx.fillStyle = shade(color, -0.1);
        ctx.beginPath();
        ctx.moveTo(vx - layerH * 0.9, layerH);
        ctx.lineTo(vx - layerH * 0.12, layerH * 0.12);
        ctx.lineTo(vx + layerH * 0.12, layerH * 0.12);
        ctx.lineTo(vx + layerH * 0.9, layerH);
        ctx.fill();
        const gl = ctx.createRadialGradient(vx, layerH * 0.12, 2, vx, layerH * 0.12, layerH * 0.3);
        gl.addColorStop(0, rgba('#ffb347', 0.9));
        gl.addColorStop(1, rgba('#ff4d1a', 0));
        ctx.fillStyle = gl;
        ctx.fillRect(vx - layerH * 0.3, 0, layerH * 0.6, layerH * 0.5);
        ctx.strokeStyle = rgba('#ff6b1a', 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(vx - 4, layerH * 0.14);
        ctx.quadraticCurveTo(vx - 20, layerH * 0.45, vx - 8, layerH * 0.9);
        ctx.stroke();
      }
      // trees on mid/near silhouettes
      if ((wid === 'hills' || wid === 'snow') && kind !== 'far') {
        ctx.fillStyle = shade(color, -0.08);
        const count = kind === 'mid' ? 40 : 18;
        for (let i = 0; i < count; i++) {
          const x = rng.next() * tileW;
          const y = layerH * (0.55 - ridge(x) * (kind === 'mid' ? 0.3 : 0.22));
          const s = (kind === 'mid' ? 14 : 26) * (0.7 + rng.next() * 0.6) * (h / 700);
          if (wid === 'snow') {
            ctx.beginPath();
            ctx.moveTo(x - s * 0.6, y + 4);
            ctx.lineTo(x, y - s * 1.8);
            ctx.lineTo(x + s * 0.6, y + 4);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(x, y - s * 0.6, s, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (wid === 'desert' && kind === 'near') {
        ctx.fillStyle = shade(color, -0.15);
        for (let i = 0; i < 6; i++) {
          const x = rng.next() * tileW;
          const y = layerH * (0.55 - ridge(x) * 0.22);
          const s = 20 * (h / 700);
          ctx.fillRect(x - s * 0.15, y - s * 2, s * 0.3, s * 2.2);
          ctx.fillRect(x - s * 0.6, y - s * 1.4, s * 0.25, s * 0.7);
          ctx.fillRect(x + s * 0.35, y - s * 1.7, s * 0.25, s * 0.8);
        }
      }
    }
    // atmospheric fade at the bottom
    const fog = ctx.createLinearGradient(0, 0, 0, layerH);
    fog.addColorStop(0, rgba(p.fog, 0));
    fog.addColorStop(1, rgba(p.fog, kind === 'far' ? 0.55 : kind === 'mid' ? 0.3 : 0.12));
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, tileW, layerH);
    ctx.globalCompositeOperation = 'source-over';

    return {
      canvas: c,
      parallax: kind === 'far' ? 0.05 : kind === 'mid' ? 0.15 : 0.32,
      base: kind === 'far' ? 0.78 : kind === 'mid' ? 0.88 : 0.98,
      fill: mix(color, p.fog, kind === 'far' ? 0.55 : kind === 'mid' ? 0.3 : 0.12),
    };
  }

  /**
   * ctx is in device pixels with identity transform. `ppm` is device pixels
   * per meter at the current zoom.
   */
  render(ctx: CanvasRenderingContext2D, camX: number, camY: number, ppm: number, time: number): void {
    if (!this.sky) return;
    const w = this.w;
    const h = this.h;
    ctx.drawImage(this.sky, 0, 0);

    if (this.world.sky === 'aurora' && this.time !== 'sunset') this.drawAurora(ctx, time);

    for (const c of this.clouds) {
      const tileW = Math.max(w, 1200) + c.c.width;
      let x = (c.x - camX * ppm * 0.03 + time * c.speed) % tileW;
      if (x < 0) x += tileW;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(c.c, x - c.c.width, c.y, c.c.width * c.s, c.c.height * c.s);
    }
    ctx.globalAlpha = 1;

    if (this.world.sky === 'smoke') this.drawSmoke(ctx, time, camX * ppm);

    for (const L of this.layers) {
      const lw = L.canvas.width;
      const lh = L.canvas.height;
      const yShift = Math.max(-h * 0.12, Math.min(h * 0.12, camY * ppm * L.parallax * 0.35));
      const y = Math.round(h * L.base - lh + yShift);
      let x = -((camX * ppm * L.parallax) % lw);
      if (x > 0) x -= lw;
      for (; x < w; x += lw) ctx.drawImage(L.canvas, Math.round(x), y);
      if (y + lh < h) {
        ctx.fillStyle = L.fill;
        ctx.fillRect(0, y + lh - 1, w, h - (y + lh) + 1);
      }
    }
  }

  private drawAurora(ctx: CanvasRenderingContext2D, time: number): void {
    const w = this.w;
    const h = this.h;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 2; b++) {
      const g = ctx.createLinearGradient(0, h * 0.05, 0, h * 0.4);
      const col = b ? '#7dffb2' : '#7dd3ff';
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.5, rgba(col, 0.16));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.4);
      for (let x = 0; x <= w; x += 24) {
        const y = h * (0.16 + b * 0.06) + Math.sin(x * 0.004 + time * 0.3 + b) * h * 0.05 + Math.sin(x * 0.011 - time * 0.5) * h * 0.02;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSmoke(ctx: CanvasRenderingContext2D, time: number, scroll: number): void {
    const h = this.h;
    const w = this.w;
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const t = (time * 0.04 + i / 5) % 1;
      const x = ((w * 0.3 - scroll * 0.05 + i * 20 + Math.sin(time * 0.2 + i) * 30) % (w + 400)) - 100;
      const y = h * (0.45 - t * 0.45);
      const r = h * (0.08 + t * 0.2);
      ctx.globalAlpha = 0.28 * (1 - t);
      ctx.fillStyle = '#2a1416';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
