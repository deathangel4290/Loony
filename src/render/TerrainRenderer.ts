import { Random } from '../core/Random';
import type { WorldDef } from '../data/types';
import { CONFIG } from '../data/config';
import { bridgeDeckY, MAT_ICE, type Structure, type TerrainGenerator } from '../game/TerrainGenerator';
import { rgba, shade } from './color';
import { createCanvas } from './Sprites';

interface ChunkPaths {
  fill: Path2D;
  surface: Path2D;
  tufts: Path2D | null;
  ice: Path2D | null;
  minY: number;
  maxY: number;
  x0: number;
  x1: number;
  /** Generated sample count when built; rebuilt if the generator was still filling it. */
  samples: number;
}

/**
 * Draws the ground: textured fill, topsoil band and a world-specific surface
 * (grass, sand, snow, asphalt, volcanic rock). Paths are cached per chunk.
 */
export class TerrainRenderer {
  private cache = new Map<number, ChunkPaths>();
  private pattern: CanvasPattern | null = null;
  private readonly chunkSamples: number;
  private readonly surf: WorldDef['terrain']['surface'];

  constructor(private gen: TerrainGenerator, private world: WorldDef, ctx: CanvasRenderingContext2D) {
    this.chunkSamples = Math.round(CONFIG.terrain.chunkLength / gen.step);
    this.surf = world.terrain.surface;
    this.pattern = this.buildPattern(ctx);
  }

  private buildPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    const size = 256;
    const metersPerTile = 8;
    const c = createCanvas(size, size);
    const g = c.getContext('2d')!;
    const p = this.world.palette;
    const rng = new Random(42);
    g.fillStyle = p.dirt;
    g.fillRect(0, 0, size, size);
    if (this.surf === 'road') {
      // building facade: window grid
      g.fillStyle = shade(p.dirt, -0.12);
      for (let x = 0; x < size; x += 64) g.fillRect(x, 0, 4, size);
      for (let y = 0; y < size; y += 32) {
        for (let x = 0; x < size; x += 32) {
          const lit = rng.next() < 0.3;
          g.fillStyle = lit ? 'rgba(255,226,140,0.85)' : shade(p.dirt, -0.3);
          g.fillRect(x + 9, y + 8, 14, 16);
        }
      }
    } else {
      for (let i = 0; i < 260; i++) {
        g.fillStyle = rng.next() < 0.5 ? p.speck : p.dirtDark;
        g.globalAlpha = 0.25 + rng.next() * 0.45;
        const r = 1.5 + rng.next() * 4;
        g.beginPath();
        g.ellipse(rng.next() * size, rng.next() * size, r * 1.4, r, rng.next() * 3, 0, Math.PI * 2);
        g.fill();
      }
      // a few pebbles
      g.globalAlpha = 1;
      for (let i = 0; i < 10; i++) {
        const x = rng.next() * size;
        const y = rng.next() * size;
        const r = 5 + rng.next() * 7;
        g.fillStyle = shade(p.dirt, this.surf === 'rock' ? -0.25 : 0.18);
        g.beginPath();
        g.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = rgba('#000000', 0.15);
        g.beginPath();
        g.ellipse(x + 1, y + r * 0.4, r * 1.2, r * 0.5, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (this.surf === 'rock') {
        g.strokeStyle = 'rgba(255,110,40,0.55)';
        g.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          let x = rng.next() * size;
          let y = rng.next() * size;
          g.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            x += (rng.next() - 0.5) * 50;
            y += rng.next() * 30;
            g.lineTo(x, y);
          }
          g.stroke();
        }
      }
    }
    const pat = ctx.createPattern(c, 'repeat');
    if (!pat) return null;
    if (typeof pat.setTransform !== 'function') return null;
    pat.setTransform(new DOMMatrix().scale(metersPerTile / size, -metersPerTile / size));
    return pat;
  }

  private chunk(c: number): ChunkPaths | null {
    const gen = this.gen;
    const i0 = c * this.chunkSamples;
    const i1 = Math.min(gen.heights.length - 1, i0 + this.chunkSamples);
    if (i1 <= i0) return null;
    const cached = this.cache.get(c);
    if (cached && cached.samples === i1 - i0) return cached;
    const fill = new Path2D();
    const surface = new Path2D();
    let tufts: Path2D | null = null;
    let ice: Path2D | null = null;
    let minY = Infinity;
    let maxY = -Infinity;
    const x0 = gen.originX + i0 * gen.step;
    const x1 = gen.originX + i1 * gen.step;
    for (let i = i0; i <= i1; i++) {
      const y = gen.heights[i];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const bottom = minY - 80;
    fill.moveTo(x0, bottom);
    for (let i = i0; i <= i1; i++) {
      const x = gen.originX + i * gen.step;
      const y = gen.heights[i];
      fill.lineTo(x, y);
      if (i === i0) surface.moveTo(x, y);
      else surface.lineTo(x, y);
    }
    fill.lineTo(x1, bottom);
    fill.closePath();

    // Ice runs
    let inIce = false;
    for (let i = i0; i < i1; i++) {
      const x = gen.originX + i * gen.step;
      if (gen.mats[i] === MAT_ICE) {
        ice ??= new Path2D();
        if (!inIce) ice.moveTo(x, gen.heights[i]);
        ice.lineTo(x + gen.step, gen.heights[i + 1]);
        inIce = true;
      } else inIce = false;
    }

    if (this.surf === 'grass') {
      tufts = new Path2D();
      const rng = new Random(c * 7349 + 3);
      for (let i = i0; i < i1; i += 1) {
        if (rng.next() < 0.45 || gen.mats[i] === MAT_ICE) continue;
        const x = gen.originX + i * gen.step + rng.next() * gen.step;
        const y = gen.heightAt(x) + 0.12;
        const h = 0.14 + rng.next() * 0.14;
        tufts.moveTo(x - 0.08, y);
        tufts.lineTo(x - 0.1, y + h);
        tufts.moveTo(x, y);
        tufts.lineTo(x + 0.02, y + h * 1.3);
        tufts.moveTo(x + 0.08, y);
        tufts.lineTo(x + 0.13, y + h);
      }
    }

    const res: ChunkPaths = { fill, surface, tufts, ice, minY, maxY, x0, x1, samples: i1 - i0 };
    this.cache.set(c, res);
    return res;
  }

  /** Draw lava/water pools that sit behind the terrain. Call before render(). */
  renderPools(ctx: CanvasRenderingContext2D, minX: number, maxX: number, time: number): void {
    for (const s of this.gen.structures) {
      if (s.x1 < minX || s.x0 > maxX || s.kind === 'bridge') continue;
      if (s.kind === 'water') {
        const g = ctx.createLinearGradient(0, s.y, 0, s.y - 4);
        const col = this.world.id === 'snow' ? '#9fd8ff' : '#3aa7e0';
        g.addColorStop(0, col);
        g.addColorStop(1, shade(col, -0.45));
        ctx.fillStyle = g;
        ctx.fillRect(s.x0 - 1, s.y - 30, s.x1 - s.x0 + 2, 30);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        for (let x = s.x0 - 1; x <= s.x1 + 1; x += 0.5) {
          const y = s.y + Math.sin(x * 1.3 + time * 2) * 0.05;
          if (x === s.x0 - 1) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        this.drawLava(ctx, s, time);
      }
    }
  }

  private drawLava(ctx: CanvasRenderingContext2D, s: Structure, time: number): void {
    const g = ctx.createLinearGradient(0, s.y, 0, s.y - 3);
    g.addColorStop(0, '#ffd166');
    g.addColorStop(0.25, '#ff7a1a');
    g.addColorStop(1, '#a3200c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s.x0 - 0.8, s.y - 30);
    for (let x = s.x0 - 0.8; x <= s.x1 + 0.8; x += 0.4) ctx.lineTo(x, s.y + Math.sin(x * 2.1 + time * 2.4) * 0.07);
    ctx.lineTo(s.x1 + 0.8, s.y - 30);
    ctx.closePath();
    ctx.fill();
  }

  /** Glow and bubbles over lava, drawn after terrain. */
  renderLavaGlow(ctx: CanvasRenderingContext2D, minX: number, maxX: number, time: number): void {
    for (const s of this.gen.structures) {
      if (s.kind !== 'lava' || s.x1 < minX || s.x0 > maxX) continue;
      const cx = (s.x0 + s.x1) / 2;
      const w = s.x1 - s.x0;
      const g = ctx.createRadialGradient(cx, s.y, 0.2, cx, s.y, Math.max(3, w * 0.9));
      g.addColorStop(0, 'rgba(255,140,40,0.45)');
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - w, s.y - 1, w * 2, Math.max(4, w));
      ctx.fillStyle = '#ffe08a';
      for (let i = 0; i < 4; i++) {
        const t = (time * 0.7 + i * 0.37) % 1;
        const x = s.x0 + ((i * 0.29 + 0.13) % 1) * w;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(x, s.y + t * 0.5, 0.08 + t * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  render(ctx: CanvasRenderingContext2D, minX: number, maxX: number): void {
    const gen = this.gen;
    const span = this.chunkSamples * gen.step;
    const c0 = Math.max(0, Math.floor((minX - gen.originX) / span));
    const c1 = Math.floor((maxX - gen.originX) / span);
    const p = this.world.palette;
    for (let c = c0; c <= c1; c++) {
      const ch = this.chunk(c);
      if (!ch) continue;
      ctx.save();
      ctx.clip(ch.fill);
      ctx.fillStyle = p.dirt;
      ctx.fill(ch.fill);
      if (this.pattern) {
        ctx.fillStyle = this.pattern;
        ctx.fill(ch.fill);
      }
      const depth = ctx.createLinearGradient(0, ch.maxY - 2, 0, ch.minY - 14);
      depth.addColorStop(0, 'rgba(0,0,0,0)');
      depth.addColorStop(1, 'rgba(10,6,20,0.45)');
      ctx.fillStyle = depth;
      ctx.fill(ch.fill);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (this.surf !== 'road') {
        ctx.strokeStyle = p.topsoil;
        ctx.lineWidth = 1.5;
        ctx.stroke(ch.surface);
      }
      ctx.strokeStyle = p.surfaceEdge;
      ctx.lineWidth = this.surf === 'snow' ? 1.0 : this.surf === 'road' ? 1.2 : 0.62;
      ctx.stroke(ch.surface);
      ctx.restore();

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      switch (this.surf) {
        case 'grass':
          ctx.strokeStyle = p.surface;
          ctx.lineWidth = 0.34;
          ctx.stroke(ch.surface);
          if (ch.tufts) {
            ctx.strokeStyle = shade(p.surface, -0.12);
            ctx.lineWidth = 0.05;
            ctx.stroke(ch.tufts);
          }
          ctx.save();
          ctx.translate(0, 0.11);
          ctx.strokeStyle = shade(p.surface, 0.25);
          ctx.lineWidth = 0.06;
          ctx.stroke(ch.surface);
          ctx.restore();
          break;
        case 'sand':
          ctx.strokeStyle = p.surface;
          ctx.lineWidth = 0.3;
          ctx.stroke(ch.surface);
          ctx.save();
          ctx.translate(0, 0.09);
          ctx.strokeStyle = shade(p.surface, 0.3);
          ctx.lineWidth = 0.05;
          ctx.stroke(ch.surface);
          ctx.restore();
          break;
        case 'snow':
          ctx.strokeStyle = p.surface;
          ctx.lineWidth = 0.42;
          ctx.stroke(ch.surface);
          ctx.save();
          ctx.translate(0, 0.14);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.08;
          ctx.stroke(ch.surface);
          ctx.restore();
          break;
        case 'road':
          ctx.strokeStyle = p.surface;
          ctx.lineWidth = 0.32;
          ctx.stroke(ch.surface);
          ctx.save();
          ctx.translate(0, 0.12);
          ctx.strokeStyle = 'rgba(220,225,240,0.75)';
          ctx.lineWidth = 0.06;
          ctx.stroke(ch.surface);
          ctx.restore();
          ctx.save();
          ctx.translate(0, -0.35);
          ctx.setLineDash([1.2, 1.4]);
          ctx.strokeStyle = 'rgba(255,214,79,0.8)';
          ctx.lineWidth = 0.07;
          ctx.stroke(ch.surface);
          ctx.restore();
          break;
        case 'rock':
          ctx.strokeStyle = p.surface;
          ctx.lineWidth = 0.3;
          ctx.stroke(ch.surface);
          ctx.save();
          ctx.translate(0, 0.1);
          ctx.strokeStyle = 'rgba(255,140,60,0.35)';
          ctx.lineWidth = 0.05;
          ctx.stroke(ch.surface);
          ctx.restore();
          break;
      }
      if (ch.ice) {
        ctx.strokeStyle = '#bfefff';
        ctx.lineWidth = 0.4;
        ctx.stroke(ch.ice);
        ctx.save();
        ctx.translate(0, 0.12);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.07;
        ctx.setLineDash([0.6, 0.9]);
        ctx.stroke(ch.ice);
        ctx.restore();
      }
    }
    // drop caches far behind
    for (const k of this.cache.keys()) if (k < c0 - 3) this.cache.delete(k);
  }

  renderBridges(ctx: CanvasRenderingContext2D, minX: number, maxX: number): void {
    for (const s of this.gen.structures) {
      if (s.kind !== 'bridge' || s.x1 < minX || s.x0 > maxX) continue;
      const wood = this.world.id === 'city' ? '#6c7389' : this.world.id === 'volcano' ? '#4a3a36' : '#a0703f';
      const dark = shade(wood, -0.4);
      // supports
      ctx.strokeStyle = dark;
      ctx.lineWidth = 0.22;
      for (let x = s.x0 + 2; x < s.x1 - 1; x += 5) {
        const y = bridgeDeckY(s, x);
        ctx.beginPath();
        ctx.moveTo(x, y - 0.2);
        ctx.lineTo(x, this.gen.heightAt(x) - 1);
        ctx.stroke();
      }
      // cables/rails
      ctx.strokeStyle = dark;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      for (let x = s.x0; x <= s.x1; x += 0.5) {
        const y = bridgeDeckY(s, x) + 0.9 + Math.sin(((x - s.x0) / (s.x1 - s.x0)) * Math.PI) * 0.25;
        if (x === s.x0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let x = s.x0; x <= s.x1; x += 1.5) {
        const y = bridgeDeckY(s, x);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 0.9 + Math.sin(((x - s.x0) / (s.x1 - s.x0)) * Math.PI) * 0.25);
        ctx.stroke();
      }
      // planks
      for (let x = s.x0; x < s.x1; x += 0.5) {
        const y = bridgeDeckY(s, x + 0.25);
        ctx.fillStyle = (Math.floor(x * 2) % 3 === 0 ? shade(wood, -0.1) : wood);
        ctx.fillRect(x + 0.02, y - 0.22, 0.46, 0.24);
      }
      ctx.strokeStyle = dark;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (let x = s.x0; x <= s.x1; x += 0.5) {
        const y = bridgeDeckY(s, x) - 0.22;
        if (x === s.x0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}
