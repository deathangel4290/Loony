import { GameSession } from '../src/game/GameSession';
import { VEHICLES, getVehicle } from '../src/data/vehicles';
import { WORLDS, getWorld } from '../src/data/worlds';
import { applyUpgrades, defaultUpgradeLevels } from '../src/data/upgrades';
import { simulate } from '../tests/bot';

const args = process.argv.slice(2);
const vehicles = args[0] && args[0] !== 'all' ? args[0].split(',') : VEHICLES.map((v) => v.id);
const worlds = args[1] && args[1] !== 'all' ? args[1].split(',') : WORLDS.map((w) => w.id);
const seeds = Number(args[2] ?? 3);
const lvl = Number(args[3] ?? 1);

for (const vid of vehicles) {
  for (const wid of worlds) {
    const rows = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const levels = defaultUpgradeLevels();
      for (const k of Object.keys(levels) as (keyof typeof levels)[]) levels[k] = lvl;
      const v = getVehicle(vid);
      const s = new GameSession({ world: getWorld(wid), vehicle: v, tuning: applyUpgrades(v.physics, levels), seed: seed * 7919 });
      const t0 = performance.now();
      const r = simulate(s, 600);
      rows.push({ ...r, ms: Math.round(performance.now() - t0) });
      s.destroy();
    }
    console.log(vid.padEnd(10), wid.padEnd(8), rows.map((r) => `${r.distance}m ${r.reason} t${r.time} v${r.avgSpeed} f${r.flips} imp${r.maxImpact} c${r.coins} fuel${r.fuel} ${r.ms}ms`).join(' | '));
  }
}
