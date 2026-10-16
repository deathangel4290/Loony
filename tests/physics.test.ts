import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/GameSession';
import { VEHICLES, getVehicle } from '../src/data/vehicles';
import { WORLDS, getWorld } from '../src/data/worlds';
import { simulate } from './bot';

describe('physics regression (headless)', () => {
  it('every vehicle drives in every world without NaN or instant crashes', () => {
    for (const v of VEHICLES) {
      for (const w of WORLDS) {
        const s = new GameSession({ world: w, vehicle: v, tuning: v.physics, seed: 4242 });
        const r = simulate(s, 25);
        const p = s.player.vehicle.chassis.getPosition();
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(r.distance, `${v.id} in ${w.id}`).toBeGreaterThan(80);
        s.destroy();
      }
    }
  }, 120_000);

  it('a novice holding gas through jumps survives the tutorial opening', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const v = getVehicle('pip');
      const s = new GameSession({ world: getWorld('hills'), vehicle: v, tuning: v.physics, seed, tutorial: true });
      while (s.state === 'running' && s.distance < 350 && s.time < 60) {
        s.input.gas = true;
        s.update(1 / 60);
      }
      expect(s.player.endReason, `seed ${seed}`).toBeNull();
      s.destroy();
    }
  }, 60_000);

  it('the starter car is fuel-limited, not crash-limited, for a skilled driver', () => {
    const v = getVehicle('pip');
    const s = new GameSession({ world: getWorld('hills'), vehicle: v, tuning: v.physics, seed: 99 });
    const r = simulate(s, 400);
    expect(r.reason).toBe('fuel');
    expect(r.distance).toBeGreaterThan(700);
  }, 60_000);
});
