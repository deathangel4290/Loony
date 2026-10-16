import { Body, ChainShape, CircleShape, EdgeShape, PolygonShape, Vec2, World } from 'planck';
import { CONFIG } from '../data/config';
import type { PropKind } from '../data/types';
import { bridgeDeckY, MAT_ICE, TerrainGenerator, type PropSpawn } from './TerrainGenerator';
import { CAT_GROUND, CAT_PROP, type FixtureData } from './VehiclePhysics';

export interface PropDef {
  /** Approximate radius used for car overlap tests. */
  radius: number;
  /** Smashes apart when hit hard instead of being knocked around. */
  breakable: boolean;
  shapes: () => (PolygonShape | CircleShape)[];
  density: number;
  friction: number;
  restitution: number;
  points: number;
  /** Height of the center above the ground when resting. */
  lift: number;
}

const box = (w: number, h: number, cx = 0, cy = 0) =>
  new PolygonShape([new Vec2(cx - w / 2, cy - h / 2), new Vec2(cx + w / 2, cy - h / 2), new Vec2(cx + w / 2, cy + h / 2), new Vec2(cx - w / 2, cy + h / 2)]);

export const PROP_DEFS: Record<PropKind, PropDef> = {
  crate: { radius: 0.5, breakable: true, shapes: () => [box(0.8, 0.8)], density: 0.35, friction: 0.7, restitution: 0.1, points: 10, lift: 0.4 },
  barrel: { radius: 0.48, breakable: false, shapes: () => [box(0.62, 0.86)], density: 0.4, friction: 0.6, restitution: 0.15, points: 10, lift: 0.43 },
  cone: { radius: 0.38, breakable: false,
    shapes: () => [new PolygonShape([new Vec2(-0.28, -0.36), new Vec2(0.28, -0.36), new Vec2(0.07, 0.38), new Vec2(-0.07, 0.38)])],
    density: 0.25, friction: 0.6, restitution: 0.2, points: 5, lift: 0.36,
  },
  snowman: { radius: 0.5, breakable: true, shapes: () => [new CircleShape(new Vec2(0, -0.12), 0.38), new CircleShape(new Vec2(0, 0.42), 0.26)], density: 0.2, friction: 0.5, restitution: 0.05, points: 15, lift: 0.5 },
  boulder: { radius: 0.58, breakable: true,
    shapes: () => [new PolygonShape([new Vec2(-0.55, -0.4), new Vec2(0.5, -0.42), new Vec2(0.62, 0.05), new Vec2(0.2, 0.45), new Vec2(-0.4, 0.38), new Vec2(-0.62, 0.0)])],
    density: 0.9, friction: 0.9, restitution: 0.05, points: 20, lift: 0.42,
  },
  hay: { radius: 0.6, breakable: true, shapes: () => [box(1.2, 0.75)], density: 0.22, friction: 0.8, restitution: 0.05, points: 10, lift: 0.375 },
  tire: { radius: 0.36, breakable: false, shapes: () => [new CircleShape(0.36)], density: 0.3, friction: 0.9, restitution: 0.45, points: 5, lift: 0.36 },
};

export interface PropState {
  spawn: PropSpawn;
  body: Body | null;
  hit: boolean;
  broken: boolean;
  /** Seconds in continuous contact with the player's car. */
  contactTime: number;
  /** Last known pose so the prop keeps its place while streamed out. */
  x: number;
  y: number;
  a: number;
  index: number;
}

interface ChunkPhys {
  body: Body;
}

/**
 * Streams terrain collision (chain shapes per chunk, split by surface
 * material), bridges, lava sensors and knockable props in and out of the
 * physics world around the camera so the simulation stays small.
 */
export class TerrainManager {
  private chunks = new Map<number, ChunkPhys>();
  private structureBodies = new Map<number, Body>();
  readonly props: PropState[] = [];
  private propCursor = 0;
  private wall: Body;
  readonly chunkSamples: number;

  constructor(private world: World, readonly gen: TerrainGenerator) {
    this.chunkSamples = Math.round(CONFIG.terrain.chunkLength / gen.step);
    this.wall = world.createBody({ type: 'static' });
    const wx = gen.originX + 0.5;
    this.wall.createFixture(new EdgeShape(new Vec2(wx, gen.heights[0] - 2), new Vec2(wx, gen.heights[0] + 60)), {
      friction: 0.4,
      userData: { tag: 'wall' } as FixtureData,
    });
  }

  update(left: number, right: number, chunkBudget = 2): void {
    const gen = this.gen;
    const lo = left - CONFIG.terrain.activeBehind;
    const hi = right + CONFIG.terrain.activeAhead;
    const span = this.chunkSamples * gen.step;
    const c0 = Math.max(0, Math.floor((lo - gen.originX) / span));
    const c1 = Math.floor((hi - gen.originX) / span);
    // A chunk's collision is built once, so its samples must all exist first.
    gen.ensure(gen.originX + (c1 + 2) * span);
    let created = 0;
    for (let c = c0; c <= c1; c++) {
      if (!this.chunks.has(c) && created < chunkBudget) {
        this.chunks.set(c, this.buildChunk(c));
        created++;
      }
    }
    for (const [c, ch] of this.chunks) {
      if (c < c0 - 1 || c > c1 + 1) {
        this.world.destroyBody(ch.body);
        this.chunks.delete(c);
      }
    }
    // Structures
    gen.structures.forEach((s, i) => {
      const active = s.x1 > lo && s.x0 < hi;
      const body = this.structureBodies.get(i);
      if (active && !body) this.structureBodies.set(i, this.buildStructure(i));
      else if (!active && body) {
        this.world.destroyBody(body);
        this.structureBodies.delete(i);
      }
    });
    this.updateProps(lo, hi);
  }

  private buildChunk(c: number): ChunkPhys {
    const gen = this.gen;
    const body = this.world.createBody({ type: 'static' });
    const i0 = c * this.chunkSamples;
    const i1 = Math.min(gen.heights.length - 1, i0 + this.chunkSamples);
    const friction = gen.world.terrain.groundFriction;
    let runStart = i0;
    for (let i = i0; i < i1; i++) {
      const mat = gen.mats[i];
      const next = i + 1 < i1 ? gen.mats[i + 1] : -1;
      if (next !== mat) {
        this.addChain(body, runStart, i + 1, mat === MAT_ICE ? 0.08 : friction, mat === MAT_ICE ? 'ice' : 'ground');
        runStart = i + 1;
      }
    }
    return { body };
  }

  private addChain(body: Body, i0: number, i1: number, friction: number, tag: 'ground' | 'ice'): void {
    const gen = this.gen;
    if (i1 <= i0) return;
    const verts: Vec2[] = [];
    for (let i = i0; i <= i1; i++) verts.push(new Vec2(gen.originX + i * gen.step, gen.heights[i]));
    const shape = new ChainShape(verts, false);
    if (i0 > 0) shape.setPrevVertex(new Vec2(gen.originX + (i0 - 1) * gen.step, gen.heights[i0 - 1]));
    if (i1 + 1 < gen.heights.length) shape.setNextVertex(new Vec2(gen.originX + (i1 + 1) * gen.step, gen.heights[i1 + 1]));
    body.createFixture(shape, { friction, restitution: 0, userData: { tag } as FixtureData });
  }

  private buildStructure(i: number): Body {
    const s = this.gen.structures[i];
    const body = this.world.createBody({ type: 'static' });
    if (s.kind === 'bridge') {
      const verts: Vec2[] = [];
      const n = Math.max(2, Math.ceil(s.x1 - s.x0));
      for (let k = 0; k <= n; k++) {
        const x = s.x0 + ((s.x1 - s.x0) * k) / n;
        verts.push(new Vec2(x, bridgeDeckY(s, x)));
      }
      body.createFixture(new ChainShape(verts, false), { friction: 0.95, userData: { tag: 'bridge' } as FixtureData });
    } else if (s.kind === 'lava') {
      const w = s.x1 - s.x0;
      body.createFixture(box(w, 3, s.x0 + w / 2, s.y - 1.5), { isSensor: true, userData: { tag: 'lava' } as FixtureData });
    }
    return body;
  }

  private updateProps(lo: number, hi: number): void {
    const spawns = this.gen.props;
    while (this.propCursor < spawns.length) {
      const sp = spawns[this.propCursor];
      this.props.push({ spawn: sp, body: null, hit: false, broken: false, contactTime: 0, x: sp.x, y: sp.y + PROP_DEFS[sp.kind].lift, a: 0, index: this.propCursor });
      this.propCursor++;
    }
    for (const p of this.props) {
      if (p.broken) continue;
      const active = p.x > lo && p.x < hi;
      if (active && !p.body) {
        const def = PROP_DEFS[p.spawn.kind];
        const b = this.world.createBody({ type: 'dynamic', position: new Vec2(p.x, p.y + 0.02), angle: p.a, linearDamping: 0.05, angularDamping: 0.1 });
        for (const sh of def.shapes()) {
          b.createFixture(sh, {
            density: def.density, friction: def.friction, restitution: def.restitution,
            filterCategoryBits: CAT_PROP, filterMaskBits: CAT_GROUND | CAT_PROP,
            userData: { tag: 'prop', ref: p.index } as FixtureData,
          });
        }
        b.setSleepingAllowed(true);
        b.setAwake(false);
        p.body = b;
      } else if (!active && p.body) {
        this.capture(p);
        this.world.destroyBody(p.body);
        p.body = null;
      } else if (p.body) {
        this.capture(p);
        // Fell off the world: retire it.
        if (p.y < this.gen.heightAt(p.x) - 20) {
          this.world.destroyBody(p.body);
          p.body = null;
          p.x = -1e6;
        }
      }
    }
  }

  breakProp(p: PropState): void {
    if (p.broken) return;
    this.capture(p);
    if (p.body) this.world.destroyBody(p.body);
    p.body = null;
    p.broken = true;
  }

  private capture(p: PropState): void {
    if (!p.body) return;
    const pos = p.body.getPosition();
    p.x = pos.x;
    p.y = pos.y;
    p.a = p.body.getAngle();
  }

  destroy(): void {
    for (const ch of this.chunks.values()) this.world.destroyBody(ch.body);
    for (const b of this.structureBodies.values()) this.world.destroyBody(b);
    for (const p of this.props) if (p.body) this.world.destroyBody(p.body);
    this.world.destroyBody(this.wall);
    this.chunks.clear();
    this.structureBodies.clear();
  }

  get activeChunkCount(): number {
    return this.chunks.size;
  }
}
