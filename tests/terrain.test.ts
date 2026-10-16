import { describe, expect, it } from 'vitest';
import { TerrainGenerator } from '../src/game/TerrainGenerator';
import { WORLDS } from '../src/data/worlds';
import { CONFIG } from '../src/data/config';

describe('TerrainGenerator', () => {
  it('is deterministic for a seed', () => {
    const a = new TerrainGenerator(WORLDS[0], 1234);
    const b = new TerrainGenerator(WORLDS[0], 1234);
    a.ensure(3000);
    b.ensure(3000);
    expect(a.heights.length).toBe(b.heights.length);
    expect(a.heights.slice(0, 2000)).toEqual(b.heights.slice(0, 2000));
    expect(a.collectibles.length).toBe(b.collectibles.length);
  });

  for (const world of WORLDS) {
    it(`produces sane terrain in ${world.id}`, () => {
      for (const seed of [1, 2, 3, 99, 4242]) {
        const g = new TerrainGenerator(world, seed);
        g.ensure(6000);
        for (const h of g.heights) expect(Number.isFinite(h)).toBe(true);
        // fuel is never missing for too long
        const fuels = g.collectibles.filter((c) => c.kind === 'fuel').map((c) => c.x);
        expect(fuels[0]).toBeLessThan(CONFIG.fuel.firstCan + 80);
        const maxGap = CONFIG.fuel.maxSpacing * world.terrain.fuelSpacingMul * 1.1 + 60;
        for (let i = 1; i < fuels.length; i++) expect(fuels[i] - fuels[i - 1]).toBeLessThan(maxGap);
        expect(fuels[fuels.length - 1]).toBeGreaterThan(5000);
        // coins exist and are above ground
        const coins = g.collectibles.filter((c) => c.kind === 'coin');
        expect(coins.length).toBeGreaterThan(300);
        for (const c of coins) expect(c.y).toBeGreaterThan(g.heightAt(c.x) + 0.3);
      }
    });
  }

  it('reports piece mix', () => {
    const g = new TerrainGenerator(WORLDS[4], 7);
    g.ensure(5000);
    const counts: Record<string, number> = {};
    for (const p of g.pieces) counts[p.id] = (counts[p.id] ?? 0) + 1;
    console.log('volcano pieces', counts, 'structures', g.structures.length);
    expect(counts.lava).toBeGreaterThan(2);
  });
});

describe('collectible ordering', () => {
  it('keeps collectibles sorted by x', () => {
    for (const world of WORLDS) {
      const g = new TerrainGenerator(world, 5);
      g.ensure(4000);
      for (let i = 1; i < g.collectibles.length; i++) expect(g.collectibles[i].x).toBeGreaterThanOrEqual(g.collectibles[i - 1].x - 6);
    }
  });
});
