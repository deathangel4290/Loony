import { GameSession } from '../src/game/GameSession';
import { getVehicle } from '../src/data/vehicles';
import { getWorld } from '../src/data/worlds';
import { wrapAngle } from '../src/core/math';
// A naive player: holds gas on the ground, lets go in the air.
const [vid = 'pip', wid = 'hills', n = '12', tut = '0'] = process.argv.slice(2);
const res: string[] = [];
for (let seed = 1; seed <= Number(n); seed++) {
  const v = getVehicle(vid);
  const s = new GameSession({ world: getWorld(wid), vehicle: v, tuning: v.physics, seed: seed * 104729, tutorial: tut === '1' });
  let maxPitch = 0;
  while (s.state === 'running' && s.time < 600) {
    const air = s.player.vehicle.airborne;
    s.input.gas = process.env.AIRGAS ? true : !air;
    s.input.brake = false;
    s.update(1 / 60);
    maxPitch = Math.max(maxPitch, wrapAngle(s.player.vehicle.chassis.getAngle()));
  }
  res.push(`${Math.round(s.distance)}m:${s.player.endReason ?? 'run'}`);
}
console.log(vid, wid, res.join(' '));
