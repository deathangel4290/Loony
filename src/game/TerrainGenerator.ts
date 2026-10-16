import { CONFIG } from '../data/config';
import { clamp, clamp01, lerp, smoothstep } from '../core/math';
import { Random } from '../core/Random';
import type { DecorKind, PropKind, TerrainPieceId, WorldDef } from '../data/types';

export const MAT_NORMAL = 0;
export const MAT_ICE = 1;

export interface Collectible {
  kind: 'coin' | 'fuel';
  x: number;
  y: number;
  value: number;
  /** 0 bronze, 1 silver, 2 gold, 3 gem-coin */
  tier: number;
  collected: boolean;
  /** Animation phase offset. */
  phase: number;
}

export interface PropSpawn {
  kind: PropKind;
  x: number;
  y: number;
}

export interface DecorSpawn {
  kind: DecorKind;
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  /** 0 = behind terrain edge, 1 = in front. */
  layer: 0 | 1;
  seed: number;
}

export interface Structure {
  kind: 'bridge' | 'lava' | 'water';
  x0: number;
  x1: number;
  y: number;
  /** Bridge sag in meters. */
  sag: number;
}

export interface Hazard {
  x0: number;
  x1: number;
}

interface CP {
  x: number;
  y: number;
  sIn: number;
  sOut: number;
  /** Segment ending at this point may exceed the slope limit. */
  steep: boolean;
  limitMul: number;
  mat: number;
}

interface PieceResult {
  id: TerrainPieceId;
  x0: number;
  x1: number;
  lip?: { x: number; y: number; slope: number };
}

interface ToOpts {
  s?: number;
  sIn?: number;
  sOut?: number;
  prevOut?: number;
  steep?: boolean;
  limitMul?: number;
  mat?: number;
}

/** Piece builder: collects relative control points, then validates them. */
class Builder {
  pts: (CP & { explicitIn: boolean; explicitOut: boolean })[] = [];
  prevOutOverride: number | null = null;
  constructor(public x: number, public y: number, public mat: number) {}

  to(dx: number, dy: number, o: ToOpts = {}): this {
    if (o.prevOut !== undefined) {
      if (this.pts.length) {
        this.pts[this.pts.length - 1].sOut = o.prevOut;
        this.pts[this.pts.length - 1].explicitOut = true;
      } else this.prevOutOverride = o.prevOut;
    }
    this.x += Math.max(0.2, dx);
    this.y += dy;
    const sIn = o.sIn ?? o.s;
    const sOut = o.sOut ?? o.s;
    this.pts.push({
      x: this.x, y: this.y,
      sIn: sIn ?? 0, sOut: sOut ?? 0,
      explicitIn: sIn !== undefined, explicitOut: sOut !== undefined,
      steep: !!o.steep, limitMul: o.limitMul ?? 1, mat: o.mat ?? this.mat,
    });
    return this;
  }
}

const hermite = (y0: number, y1: number, s0: number, s1: number, dx: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * dx * s0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * dx * s1;
};

const hermiteSlope = (y0: number, y1: number, s0: number, s1: number, dx: number, t: number): number => {
  const t2 = t * t;
  return ((6 * t2 - 6 * t) * y0 + (3 * t2 - 4 * t + 1) * dx * s0 + (-6 * t2 + 6 * t) * y1 + (3 * t2 - 2 * t) * dx * s1) / dx;
};

export interface GeneratorOptions {
  tutorial?: boolean;
  /** Forces coin density for debug tools. */
  coinMul?: number;
}

/**
 * Seeded, streaming terrain generator. Terrain is a height field sampled every
 * `step` meters, built from hand-designed "pieces" whose control points are
 * joined with C1-continuous Hermite splines. Every non-ramp segment is checked
 * against a climbable-slope limit so there's always a way forward.
 */
export class TerrainGenerator {
  readonly step = CONFIG.terrain.step;
  /** World x of heights[0]. */
  readonly originX = -34;
  readonly heights: number[] = [];
  /** Material of the segment starting at each sample. */
  readonly mats: number[] = [];
  readonly structures: Structure[] = [];
  readonly hazards: Hazard[] = [];
  readonly collectibles: Collectible[] = [];
  readonly props: PropSpawn[] = [];
  readonly decor: DecorSpawn[] = [];
  readonly pieces: PieceResult[] = [];

  private last: CP;
  private rng: Random;
  private coinRng: Random;
  private decorRng: Random;
  private nextFuelX: number = CONFIG.fuel.firstCan;
  private nextDecorX: number;
  private lastPiece: TerrainPieceId = 'plateau';
  private tutorialQueue: TerrainPieceId[] = [];

  constructor(readonly world: WorldDef, readonly seed: number, private opts: GeneratorOptions = {}) {
    this.rng = new Random(seed);
    this.coinRng = this.rng.fork(1);
    this.decorRng = this.rng.fork(2);
    const startY = 0;
    this.last = { x: this.originX, y: startY + 14, sIn: 0, sOut: 0, steep: false, limitMul: 1, mat: MAT_NORMAL };
    this.heights.push(this.last.y);
    this.mats.push(MAT_NORMAL);
    // Back wall: a steep cliff behind the start so you can't reverse off the map.
    const b = new Builder(this.last.x, this.last.y, MAT_NORMAL);
    b.to(4, -14, { steep: true, sIn: -1.2, sOut: 0 });
    b.to(CONFIG.terrain.startFlat + 4, 0, { s: 0 });
    this.commit(b);
    this.nextDecorX = this.originX + 6;
    if (opts.tutorial) this.tutorialQueue = ['rolling', 'kicker', 'plateau', 'hill', 'rolling', 'kicker', 'valley'];
    this.ensure(160);
  }

  get endX(): number {
    return this.last.x;
  }

  /** 0..1 difficulty at world x. */
  difficulty(x: number): number {
    const base = this.opts.tutorial ? -0.15 : this.world.terrain.baseDifficulty;
    return clamp01(base + (1 - Math.exp(-Math.max(0, x) / 2600)) * 0.95);
  }

  maxUpSlope(d: number): number {
    return Math.tan(lerp(20, 34, d) * (Math.PI / 180));
  }

  ensure(xMax: number): void {
    let guard = 0;
    while (this.last.x < xMax && guard++ < 400) this.addPiece();
  }

  // ---------------------------------------------------------------- queries

  heightAt(x: number): number {
    const fi = (x - this.originX) / this.step;
    if (fi <= 0) return this.heights[0];
    const i = Math.floor(fi);
    if (i >= this.heights.length - 1) return this.heights[this.heights.length - 1];
    const t = fi - i;
    return this.heights[i] + (this.heights[i + 1] - this.heights[i]) * t;
  }

  slopeAt(x: number): number {
    return (this.heightAt(x + 0.25) - this.heightAt(x - 0.25)) / 0.5;
  }

  /** Drivable surface height, including bridge decks. */
  surfaceAt(x: number): number {
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const s = this.structures[i];
      if (s.kind === 'bridge' && x >= s.x0 && x <= s.x1) return bridgeDeckY(s, x);
      if (s.x1 < x - 200) break;
    }
    return this.heightAt(x);
  }

  isHazard(x: number, margin = 0): boolean {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (x >= h.x0 - margin && x <= h.x1 + margin) return true;
      if (h.x1 < x - 300) break;
    }
    return false;
  }

  materialAt(x: number): number {
    const i = Math.floor((x - this.originX) / this.step);
    return this.mats[Math.max(0, Math.min(this.mats.length - 1, i))] ?? MAT_NORMAL;
  }

  sampleIndex(x: number): number {
    return Math.floor((x - this.originX) / this.step);
  }

  // ------------------------------------------------------------- generation

  private addPiece(): void {
    const x = this.last.x;
    const d = this.difficulty(x);
    let id: TerrainPieceId;
    if (this.tutorialQueue.length) id = this.tutorialQueue.shift()!;
    else id = this.choosePiece(x, d);

    let result: PieceResult | null = null;
    for (let attempt = 0; attempt < 5 && !result; attempt++) {
      const k = Math.pow(0.72, attempt);
      const b = this.build(id, d, k);
      if (this.validate(b, d)) result = this.commitPiece(id, b);
    }
    if (!result) {
      const b = new Builder(this.last.x, this.last.y, this.last.mat);
      b.to(18, 0, { s: 0 });
      result = this.commitPiece('plateau', b);
      id = 'plateau';
    }
    this.lastPiece = id;
    this.populate(result, d);
  }

  private choosePiece(x: number, d: number): TerrainPieceId {
    const w = this.world.terrain.pieceWeights;
    const ids = Object.keys(w) as TerrainPieceId[];
    const big: TerrainPieceId[] = ['kicker', 'gap', 'lava', 'bridge', 'rooftops'];
    const wasBig = big.includes(this.lastPiece);
    return this.rng.weighted(ids, (id) => {
      let wt = w[id] ?? 0;
      if (id === this.lastPiece && id !== 'rolling') wt *= 0.25;
      if (wasBig && big.includes(id)) wt *= 0.35;
      switch (id) {
        case 'gap': wt *= smoothstep((d - 0.05) / 0.35); break;
        case 'lava': wt *= x > 220 ? 1 : 0; break;
        case 'bridge': wt *= x > 150 ? 1 : 0; break;
        case 'climb': wt *= 0.5 + d; break;
        case 'bumps': wt *= 0.4 + d; break;
        case 'plateau': wt *= 1.2 - d * 0.6; break;
        case 'kicker': wt *= x > 60 ? 1 : 0.2; break;
      }
      return wt;
    });
  }

  private build(id: TerrainPieceId, d: number, k: number): Builder {
    const r = this.rng;
    const m = this.maxUpSlope(d);
    const b = new Builder(this.last.x, this.last.y, MAT_NORMAL);
    const iceOk = this.world.terrain.iceChance > 0 && this.last.x > 120;
    const icy = (): number => (iceOk && r.chance(this.world.terrain.iceChance) ? MAT_ICE : MAT_NORMAL);

    switch (id) {
      case 'rolling': {
        const n = r.int(3, 5);
        const mat = icy();
        let up = r.chance(0.5);
        for (let i = 0; i < n; i++) {
          const w = r.range(10, 19);
          const a = r.range(0.5, 1.1 + 2.2 * d) * k;
          const drift = r.range(-0.5, 0.6) * k;
          b.to(w / 2, (up ? a : -a) + drift, { mat });
          up = !up;
        }
        b.to(r.range(6, 10), r.range(-0.3, 0.3), { s: 0, mat });
        break;
      }
      case 'hill': {
        const H = r.range(2.5, 5 + 9 * d) * k;
        const upL = Math.max((H * 1.7) / m, r.range(10, 16));
        b.to(upL * 0.55, H * 0.62);
        b.to(upL * 0.45, H * 0.38, { s: 0 });
        const D = H * r.range(0.7, 1.35);
        const downL = Math.max(D * 1.5, r.range(10, 16));
        b.to(downL * 0.5, -D * 0.55);
        b.to(downL * 0.5, -D * 0.45, { s: 0 });
        break;
      }
      case 'doubleHill': {
        for (let i = 0; i < 2; i++) {
          const a = r.range(1.4, 2.8 + 3 * d) * k;
          const w = Math.max(r.range(9, 14), (a * 3.2) / m);
          b.to(w / 2, a, { s: 0 });
          b.to(w / 2, -a * r.range(0.85, 1.1), { s: 0 });
        }
        b.to(r.range(5, 8), 0, { s: 0 });
        break;
      }
      case 'valley': {
        const D = r.range(2.5, 4.5 + 7 * d) * k;
        const downL = r.range(9, 14) + D;
        b.to(downL * 0.5, -D * 0.5);
        b.to(downL * 0.5, -D * 0.5, { s: 0 });
        const upH = D * r.range(0.7, 1.15);
        const upL = Math.max((upH * 1.7) / m, r.range(10, 16));
        b.to(upL * 0.5, upH * 0.5);
        b.to(upL * 0.5, upH * 0.5, { s: 0 });
        break;
      }
      case 'climb': {
        const H = r.range(5, 10 + 20 * d) * k;
        const avg = r.range(0.5, 0.78) * m;
        const L = H / avg;
        const n = r.int(3, 4);
        let remaining = H;
        for (let i = 0; i < n; i++) {
          const dy = i === n - 1 ? remaining : (H / n) * r.range(0.7, 1.3);
          remaining -= dy;
          b.to(L / n, dy);
        }
        b.to(r.range(6, 10), r.range(0, 0.4), { s: 0 });
        break;
      }
      case 'descent': {
        const mat = icy();
        const H = r.range(5, 10 + 18 * d) * k;
        const avg = r.range(0.32, 0.62);
        const L = H / avg;
        const n = r.int(2, 4);
        for (let i = 0; i < n; i++) b.to(L / n, -(H / n) * r.range(0.75, 1.25), { mat });
        b.to(r.range(6, 10), -0.3, { s: -0.05, mat });
        break;
      }
      case 'plateau': {
        const mat = icy();
        b.to(r.range(10, 16), r.range(-0.4, 0.4), { mat });
        b.to(r.range(8, 14), r.range(-0.4, 0.4), { s: 0, mat });
        break;
      }
      case 'bumps': {
        const n = r.int(5, 8);
        for (let i = 0; i < n; i++) {
          const w = r.range(2.4, 3.8);
          const a = Math.min(r.range(0.22, 0.42 + 0.4 * d) * k, (w * m * 1.25) / 3);
          b.to(w / 2, a, { s: 0, limitMul: 1.3 });
          b.to(w / 2, -a + r.range(-0.08, 0.1), { s: 0, limitMul: 1.3 });
        }
        b.to(4, 0, { s: 0 });
        break;
      }
      case 'kicker':
      case 'gap':
      case 'lava': {
        // Run-up: a downhill to guarantee speed even from a standstill.
        b.to(r.range(10, 15), -r.range(1.6, 2.8 + d));
        b.to(4, -0.25, { s: 0 });
        const theta = (r.range(17, 23 + 9 * d) * Math.PI) / 180 * (id === 'kicker' ? 1 : 0.95);
        const rampLen = r.range(4.2, 6.2);
        const slope = Math.tan(theta);
        if (id === 'kicker') {
          const drop = r.range(1.4, 2.6 + 3 * d) * k;
          b.to(rampLen, (rampLen * slope) / 2, { sIn: slope, sOut: -1.6, steep: true });
          b.to(0.9 + drop * 0.35, -drop * 0.65, { sIn: -0.9, sOut: -0.7, steep: true });
          b.to(r.range(8, 13), -drop * 0.35 - r.range(0.8, 2.6), { s: -0.18 });
          b.to(r.range(7, 11), -0.4, { s: 0 });
        } else if (id === 'gap') {
          const D = r.range(2.2, 3.2 + 1.4 * d);
          b.to(rampLen, (rampLen * slope) / 2, { sIn: slope, sOut: -3, steep: true });
          b.to(1.3, -D, { sIn: -2.6, sOut: 0, steep: true });
          b.to(r.range(0.8, 1.8 + 2 * d), -0.1, { s: 0 });
          const landY = -r.range(0.3, 1.2);
          const rise = D + (rampLen * slope) / 2 + landY + 0.1;
          const exitL = (1.5 * rise) / (0.9 * m);
          b.to(exitL, rise, { s: 0 });
          b.to(r.range(6, 9), -0.3, { s: -0.05 });
        } else {
          const W = r.range(3.8, 5.6 + 3.2 * d);
          b.to(rampLen, (rampLen * slope) / 2, { sIn: slope, sOut: -3.5, steep: true });
          b.to(0.9, -2.6, { sIn: -3.5, sOut: 0, steep: true });
          b.to(Math.max(0.6, W - 1.8), -0.3, { s: 0, steep: true });
          b.to(0.9, 2.0, { sIn: 3.5, sOut: 0, steep: true, prevOut: 3.5 });
          b.to(r.range(9, 13), -0.9, { s: -0.12 });
          b.to(r.range(5, 8), -0.2, { s: 0 });
        }
        break;
      }
      case 'bridge': {
        b.to(r.range(5, 8), 0, { s: 0 });
        const W = r.range(14, 20 + 8 * d);
        const D = r.range(6, 9 + 4 * d);
        b.to(1.6, -D * 0.6, { sIn: -2.2, steep: true, prevOut: -1.5 });
        b.to(W * 0.25, -D * 0.4, { s: 0, steep: true });
        b.to(Math.max(1, W * 0.5 - 3.2), 0, { s: 0, steep: true });
        b.to(W * 0.25, D * 0.4, { steep: true });
        b.to(1.6, D * 0.6, { sIn: 1.5, sOut: 0, steep: true });
        b.to(r.range(5, 8), 0, { s: 0 });
        break;
      }
      case 'rooftops': {
        const n = r.int(2, 4);
        for (let i = 0; i < n; i++) {
          b.to(r.range(12, 22), 0, { s: 0 });
          const t = r.next();
          if (t < 0.5) {
            // drop down to a lower roof
            b.to(0.35, -r.range(2, 3.6), { sIn: -7, sOut: 0, steep: true, prevOut: -7 });
          } else if (t < 0.8) {
            // scaffold ramp up to a higher roof
            const H = r.range(2, 4) * k;
            b.to((H * 1.6) / m, H, { s: 0 });
          } else {
            // roof kicker
            const s = Math.tan((r.range(18, 24) * Math.PI) / 180);
            b.to(4.5, 1.1, { sIn: s, sOut: -5, steep: true });
            b.to(0.5, -3.2, { sIn: -5, sOut: 0, steep: true });
          }
        }
        b.to(r.range(8, 12), 0, { s: 0 });
        break;
      }
    }
    return b;
  }

  /** Assign Catmull-Rom slopes, then reject pieces with unclimbable segments. */
  private validate(b: Builder, d: number): boolean {
    const pts = b.pts;
    const prev = this.last;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const before = i === 0 ? prev : pts[i - 1];
      const after = pts[i + 1];
      if (!p.explicitIn || !p.explicitOut) {
        const cr = after ? (after.y - before.y) / (after.x - before.x) : (p.y - before.y) / (p.x - before.x) * 0.4;
        if (!p.explicitIn) p.sIn = cr;
        if (!p.explicitOut) p.sOut = cr;
      }
    }
    const m = this.maxUpSlope(d);
    const down = 1.25;
    let a: CP = { ...prev, sOut: b.prevOutOverride ?? prev.sOut };
    for (const p of pts) {
      if (!p.steep) {
        const dx = p.x - a.x;
        for (let s = 0; s <= 12; s++) {
          const slope = hermiteSlope(a.y, p.y, a.sOut, p.sIn, dx, s / 12);
          if (slope > m * p.limitMul + 1e-3 || slope < -down * p.limitMul) return false;
        }
      }
      a = p;
    }
    return true;
  }

  private commitPiece(id: TerrainPieceId, b: Builder): PieceResult {
    const x0 = this.last.x;
    const lipIndex = b.pts.findIndex((p) => p.steep && p.sOut < -0.5 && p.sIn > 0.2);
    const lip = lipIndex >= 0 ? { x: b.pts[lipIndex].x, y: b.pts[lipIndex].y, slope: b.pts[lipIndex].sIn } : undefined;
    const startPts = b.pts.slice();
    this.commit(b);
    const res: PieceResult = { id, x0, x1: this.last.x, lip };

    if (id === 'bridge') {
      // pts: [approach, wallTop, ..., wallTop2, exit]
      const xa = startPts[0].x;
      const xb = startPts[5].x;
      const deckY = startPts[0].y;
      this.structures.push({ kind: 'bridge', x0: xa - 0.6, x1: xb + 0.6, y: deckY, sag: 0.35 });
      const bottom = startPts[2].y;
      this.structures.push({
        kind: this.world.id === 'volcano' ? 'lava' : 'water',
        x0: xa + 0.4, x1: xb - 0.4, y: bottom + 1.4, sag: 0,
      });
    } else if (id === 'lava' && lip) {
      const landing = startPts[lipIndex + 3];
      this.structures.push({ kind: 'lava', x0: lip.x + 0.25, x1: landing.x - 0.15, y: lip.y - 1.7, sag: 0 });
      this.hazards.push({ x0: lip.x - 1, x1: landing.x + 1 });
    } else if (id === 'gap' && lip) {
      this.hazards.push({ x0: lip.x, x1: startPts[lipIndex + 3].x });
    }
    this.pieces.push(res);
    return res;
  }

  /** Sample the control points into the height field. */
  private commit(b: Builder): void {
    let a = this.last;
    if (b.prevOutOverride !== null) a = { ...a, sOut: b.prevOutOverride };
    for (const p of b.pts) {
      const dx = p.x - a.x;
      let i = this.heights.length;
      for (;;) {
        const x = this.originX + i * this.step;
        if (x > p.x + 1e-6) break;
        const t = clamp((x - a.x) / dx, 0, 1);
        this.heights.push(hermite(a.y, p.y, a.sOut, p.sIn, dx, t));
        this.mats.push(p.mat);
        i++;
      }
      a = p;
    }
    this.last = { ...a };
  }

  // ------------------------------------------------------------- population

  private coinValue(x: number): { value: number; tier: number } {
    const mul = this.world.coinMultiplier;
    if (x > 3000) return { value: Math.round(25 * mul), tier: 2 };
    if (x > 1200) return { value: Math.round(10 * mul), tier: 1 };
    return { value: Math.round(5 * mul), tier: 0 };
  }

  private addCoin(x: number, y: number, big = false): void {
    const v = this.coinValue(x);
    this.collectibles.push({
      kind: 'coin', x, y,
      value: big ? v.value * 5 : v.value,
      tier: big ? 3 : v.tier,
      collected: false,
      phase: this.coinRng.next() * Math.PI * 2,
    });
  }

  private populate(p: PieceResult, d: number): void {
    const startIndex = this.collectibles.length;
    this.populateItems(p, d);
    // Keep collectibles sorted by x so runtime scans can stop early.
    const tail = this.collectibles.splice(startIndex).sort((a, b) => a.x - b.x);
    for (const c of tail) this.collectibles.push(c);
  }

  private populateItems(p: PieceResult, d: number): void {
    const r = this.coinRng;
    const density = this.opts.coinMul ?? 1;
    // Coins
    if (p.lip && (p.id === 'kicker' || p.id === 'gap' || p.id === 'lava')) {
      this.coinArc(p.lip, d);
    } else if (p.id === 'bridge') {
      const s = this.structures[this.structures.length - 2];
      const n = Math.floor((s.x1 - s.x0 - 3) / 1.3);
      for (let i = 0; i < n; i++) {
        const x = s.x0 + 1.5 + i * 1.3;
        this.addCoin(x, bridgeDeckY(s, x) + 1.0);
      }
    } else if (r.chance(0.72 * density)) {
      const span = p.x1 - p.x0;
      const n = Math.min(14, r.int(5, 10));
      const start = p.x0 + r.range(2, Math.max(3, span - n * 1.15 - 2));
      const lift = r.chance(0.25) ? 2.4 : 1.05;
      for (let i = 0; i < n; i++) {
        const x = start + i * 1.15;
        if (this.isHazard(x, 1)) continue;
        this.addCoin(x, this.heightAt(x) + lift);
      }
    }

    // Fuel
    const fuelSpacing = (x: number) => {
      const f = CONFIG.fuel;
      const s = f.baseSpacing * (1 + (f.spacingGrowth * x) / 100) * this.world.terrain.fuelSpacingMul;
      return Math.min(f.maxSpacing * this.world.terrain.fuelSpacingMul, s);
    };
    if (this.opts.tutorial && this.nextFuelX > 140) this.nextFuelX = 140;
    while (this.nextFuelX < p.x1 - 2) {
      let x = Math.max(this.nextFuelX, p.x0 + 1);
      let placed = false;
      for (; x < p.x1 - 1; x += 1) {
        if (!this.isFuelSpot(x)) continue;
        this.collectibles.push({ kind: 'fuel', x, y: this.surfaceAt(x) + 1.0, value: 1, tier: 0, collected: false, phase: 0 });
        this.nextFuelX = x + fuelSpacing(x) * r.range(0.9, 1.1);
        placed = true;
        break;
      }
      if (!placed) break;
    }

    // Props
    const props = this.world.props;
    if (props.length && (p.id === 'plateau' || p.id === 'rolling' || p.id === 'rooftops' || p.id === 'doubleHill') && r.chance(0.55)) {
      const n = r.int(1, 3);
      const x = p.x0 + r.range(4, Math.max(5, p.x1 - p.x0 - 6));
      const kind = r.pick(props);
      for (let i = 0; i < n; i++) {
        const px = x + i * 1.4;
        if (this.isHazard(px, 2) || Math.abs(this.slopeAt(px)) > 0.3) continue;
        this.props.push({ kind, x: px, y: this.heightAt(px) });
      }
    }

    // Decor
    const dr = this.decorRng;
    const kinds = this.world.decor;
    while (this.nextDecorX < p.x1) {
      const x = this.nextDecorX;
      this.nextDecorX += dr.range(3.5, 9);
      if (this.isHazard(x, 2) || this.inStructure(x)) continue;
      if (Math.abs(this.slopeAt(x)) > 0.55) continue;
      const kind = dr.pick(kinds);
      const front = kind === 'flower' || kind === 'skull' || (kind === 'rock' && dr.chance(0.4)) || kind === 'hydrant';
      this.decor.push({
        kind,
        x,
        y: this.heightAt(x),
        scale: dr.range(0.8, 1.25),
        flip: dr.chance(0.5),
        layer: front ? 1 : 0,
        seed: Math.floor(dr.next() * 1e6),
      });
    }
    void d;
  }

  /**
   * Fuel must be reachable by simply driving: never on a crest (where cars
   * go airborne), in a jump's flight path, or in a hazard.
   */
  private isFuelSpot(x: number): boolean {
    if (this.isHazard(x, 3)) return false;
    if (Math.abs(this.slopeAt(x)) > 0.5) return false;
    const h = this.heightAt(x);
    const curvature = this.heightAt(x - 4) + this.heightAt(x + 4) - 2 * h;
    if (curvature < -0.25) return false;
    for (let i = this.pieces.length - 1; i >= 0 && i >= this.pieces.length - 3; i--) {
      const lip = this.pieces[i].lip;
      if (lip && x > lip.x - 3 && x < lip.x + 30) return false;
    }
    // Ground must not drop away just behind (that launches the car).
    if (this.heightAt(x - 6) - h > 1.6 && this.slopeAt(x - 3) < -0.45) return false;
    return true;
  }

  private inStructure(x: number): boolean {
    for (let i = this.structures.length - 1; i >= 0 && i >= this.structures.length - 6; i--) {
      const s = this.structures[i];
      if (x >= s.x0 - 1 && x <= s.x1 + 1) return true;
    }
    return false;
  }

  /** Coins along the jump's expected flight path reward committing to it. */
  private coinArc(lip: { x: number; y: number; slope: number }, d: number): void {
    const v = 11 + 5 * d;
    const ang = Math.atan(lip.slope);
    const vx = v * Math.cos(ang);
    const vy = v * Math.sin(ang);
    const g = CONFIG.physics.gravity;
    let placed = 0;
    for (let t = 0.12; t < 2.5 && placed < 12; t += 0.11) {
      const x = lip.x + vx * t;
      const y = lip.y + 0.9 + vy * t - 0.5 * g * t * t;
      const ground = this.heightAt(x);
      if (y < ground + 0.9) {
        if (t > 0.5) break;
        continue;
      }
      this.addCoin(x, y, placed === 5 && this.coinRng.chance(0.5));
      placed++;
    }
  }
}

export const bridgeDeckY = (s: Structure, x: number): number => {
  const t = clamp01((x - s.x0) / (s.x1 - s.x0));
  return s.y - Math.sin(t * Math.PI) * s.sag;
};
