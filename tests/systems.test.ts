import { describe, expect, it } from 'vitest';
import { SaveManager } from '../src/systems/SaveManager';
import { MemoryStorage } from '../src/systems/Storage';
import { sanitizeSave, createDefaultSave } from '../src/systems/SaveData';
import { Services } from '../src/systems/Services';
import { DailyRewardManager, localDateKey } from '../src/systems/DailyRewardManager';
import { upgradeCost, applyUpgrades, defaultUpgradeLevels } from '../src/data/upgrades';
import { VEHICLES } from '../src/data/vehicles';
import type { RunSummary } from '../src/systems/RunSummary';

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  worldId: 'hills', vehicleId: 'pip', seed: 1, distance: 800, score: 5000, coinsCollected: 300, trickCoins: 40,
  distanceCoins: 48, coinsEarned: 388, trickPoints: 400, xpEarned: 120, flips: 2, backflips: 2, frontflips: 0,
  perfectLandings: 1, tricks: 3, longestWheelie: 1.5, longestAirtime: 2.1, maxAltitude: 22, bestCombo: 2,
  fuelCollected: 3, endReason: 'fuel', duration: 70, ...over,
});

describe('SaveManager', () => {
  it('round-trips data', async () => {
    const st = new MemoryStorage();
    const a = new SaveManager(st, 0);
    await a.load();
    a.data.coins = 1234;
    a.data.ownedVehicles.push('scrambler');
    a.markDirty();
    await a.flush();
    const b = new SaveManager(st, 0);
    await b.load();
    expect(b.loadSource).toBe('primary');
    expect(b.data.coins).toBe(1234);
    expect(b.data.ownedVehicles).toContain('scrambler');
  });

  it('falls back to the backup when the primary is corrupted', async () => {
    const st = new MemoryStorage();
    const a = new SaveManager(st, 0);
    await a.load();
    a.data.coins = 10;
    a.markDirty();
    await a.flush();
    a.data.coins = 20;
    a.markDirty();
    await a.flush();
    await st.set('loony.save', '{"v":1,"sum":1,"data":"{garbage'); // torn write
    const b = new SaveManager(st, 0);
    await b.load();
    expect(b.loadSource).toBe('backup');
    expect(b.data.coins).toBe(10);
  });

  it('starts fresh when everything is unreadable', async () => {
    const st = new MemoryStorage();
    await st.set('loony.save', 'not json');
    await st.set('loony.save.bak', '{}');
    const s = new SaveManager(st, 0);
    await s.load();
    expect(s.loadSource).toBe('new');
    expect(s.data.coins).toBe(0);
  });

  it('sanitizes bad fields individually', () => {
    const d = sanitizeSave({
      coins: -50, gems: 'lots', level: 3, ownedVehicles: ['scrambler', 'tank', 42], selectedVehicle: 'tank',
      upgrades: { scrambler: { engine: 99, tires: NaN } }, settings: { musicVolume: 7, quality: 'ultra' },
      daily: { lastClaimDate: 'yesterday', dayIndex: 12 },
    });
    expect(d.coins).toBe(0);
    expect(d.gems).toBe(0);
    expect(d.level).toBe(3);
    expect(d.ownedVehicles).toEqual(['pip', 'scrambler']);
    expect(d.selectedVehicle).toBe('pip');
    expect(d.upgrades.scrambler.engine).toBe(10);
    expect(d.upgrades.scrambler.tires).toBe(1);
    expect(d.settings.musicVolume).toBe(1);
    expect(d.settings.quality).toBe('high');
    expect(d.daily.lastClaimDate).toBeNull();
    expect(d.daily.dayIndex).toBe(6);
  });
});

describe('Services / progression', () => {
  const make = async () => {
    const s = new Services(new MemoryStorage());
    await s.save.load();
    s.missions.ensure();
    return s;
  };

  it('pays out a run and records bests and stats', async () => {
    const s = await make();
    const r = s.finishRun(run());
    expect(r.newBest).toBe(true);
    expect(s.currency.coins).toBeGreaterThanOrEqual(388);
    expect(s.save.data.bestDistance.hills).toBe(800);
    expect(s.save.data.stats.runs).toBe(1);
    expect(r.achievements.map((a) => a.id)).toContain('first_run');
    const r2 = s.finishRun(run({ distance: 500 }));
    expect(r2.newBest).toBe(false);
    expect(r2.previousBest).toBe(800);
  });

  it('levels up with rewards', async () => {
    const s = await make();
    const reached = s.progression.addXp(5000);
    expect(reached.length).toBeGreaterThan(2);
    expect(s.progression.level).toBe(1 + reached.length);
    expect(s.currency.coins).toBeGreaterThan(0);
  });

  it('completes and claims missions, then refills the slot', async () => {
    const s = await make();
    const m = s.missions.active[0];
    m.target = 1;
    m.type = 'runs';
    const done = s.missions.applyRun(run());
    expect(done.map((x) => x.id)).toContain(m.id);
    const before = s.currency.coins;
    expect(s.missions.claim(m.id)).not.toBeNull();
    expect(s.currency.coins).toBeGreaterThan(before);
    expect(s.missions.active.length).toBe(3);
    expect(s.missions.active.find((x) => x.id === m.id)).toBeUndefined();
  });

  it('enforces upgrade costs and max level', async () => {
    const s = await make();
    expect(s.upgrades.upgrade('pip', 'engine')).toBe('funds');
    s.currency.add('coins', 1_000_000);
    for (let i = 0; i < 9; i++) expect(s.upgrades.upgrade('pip', 'engine')).toBe('ok');
    expect(s.upgrades.upgrade('pip', 'engine')).toBe('max');
    expect(s.upgrades.upgrade('nova', 'engine')).toBe('locked');
  });

  it('gates vehicle purchases by level and coins', async () => {
    const s = await make();
    expect(s.garage.buy('scrambler')).toBe('level');
    s.save.data.level = 5;
    expect(s.garage.buy('scrambler')).toBe('funds');
    s.currency.add('coins', 2500);
    expect(s.garage.buy('scrambler')).toBe('ok');
    expect(s.garage.owns('scrambler')).toBe(true);
    expect(s.currency.coins).toBe(0);
  });

  it('converts duplicate cosmetic rewards to gems', async () => {
    const s = await make();
    s.grant({ cosmetic: 'decal_loony' });
    expect(s.garage.ownsCosmetic('decal_loony')).toBe(true);
    s.grant({ cosmetic: 'decal_loony' });
    expect(s.currency.gems).toBe(10);
  });
});

describe('Daily rewards', () => {
  it('allows one claim per calendar day and cycles', async () => {
    const save = new SaveManager(new MemoryStorage(), 0);
    await save.load();
    let now = new Date(2026, 0, 10, 12);
    const granted: unknown[] = [];
    const d = new DailyRewardManager(save, (r) => granted.push(r), () => now);
    expect(d.claim()).not.toBeNull();
    expect(d.claim()).toBeNull();
    now = new Date(2026, 0, 9, 12); // clock rolled back
    expect(d.canClaim()).toBe(false);
    for (let i = 1; i < 8; i++) {
      now = new Date(2026, 0, 10 + i, 9);
      expect(d.claim()).not.toBeNull();
    }
    expect(save.data.daily.cycles).toBe(1);
    expect(save.data.daily.dayIndex).toBe(1);
    expect(localDateKey(new Date(2026, 1, 3))).toBe('2026-02-03');
    expect(granted.length).toBe(8);
  });
});

describe('Economy', () => {
  it('upgrade costs grow and upgrades change physics noticeably', () => {
    for (const v of VEHICLES) {
      let prev = 0;
      for (let l = 1; l < 10; l++) {
        const c = upgradeCost(v, 'engine', l);
        expect(c).toBeGreaterThan(prev);
        prev = c;
      }
      const base = applyUpgrades(v.physics, defaultUpgradeLevels());
      const maxed = applyUpgrades(v.physics, { engine: 10, tires: 10, suspension: 10, fuel: 10, air: 10, brakes: 10 });
      expect(maxed.motorTorque / base.motorTorque).toBeGreaterThan(1.7);
      expect(maxed.fuelCapacity / base.fuelCapacity).toBeGreaterThan(2);
    }
    expect(createDefaultSave().ownedVehicles).toEqual(['pip']);
  });
});
