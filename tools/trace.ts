import { GameSession } from '../src/game/GameSession';
import { getVehicle } from '../src/data/vehicles';
import { getWorld } from '../src/data/worlds';
import { botInput } from '../tests/bot';
import { wrapAngle } from '../src/core/math';

const [vid = 'pip', wid = 'hills', seedArg = '1'] = process.argv.slice(2);
const v = getVehicle(vid);
const s = new GameSession({ world: getWorld(wid), vehicle: v, tuning: v.physics, seed: Number(seedArg) * 7919 });
const log: string[] = [];
let lastLog = -1;
s.events.on('trick', (e) => log.push(`  trick ${e.awards.map((a) => a.label).join(',')}`));
s.events.on('crash', (e) => log.push(`  CRASH ${e.reason} at x=${e.x.toFixed(1)}`));
s.events.on('land', (e) => log.push(`  land str=${e.strength.toFixed(1)} x=${e.x.toFixed(0)}`));
while (s.state !== 'ended' && s.time < 300) {
  const i = botInput(s);
  s.input.gas = i.gas;
  s.input.brake = i.brake;
  s.update(1 / 60);
  const c = s.player.vehicle.chassis;
  if (Math.floor(s.time * 2) !== lastLog) {
    lastLog = Math.floor(s.time * 2);
    const x = c.getPosition().x;
    const piece = s.gen.pieces.find((p) => x >= p.x0 && x < p.x1);
    log.push(`t=${s.time.toFixed(1)} x=${x.toFixed(1)} y=${c.getPosition().y.toFixed(1)} ang=${(wrapAngle(c.getAngle()) * 57.3).toFixed(0)} v=${s.player.vehicle.speed.toFixed(1)} slope=${(Math.atan(s.gen.slopeAt(x)) * 57.3).toFixed(0)} air=${s.player.vehicle.airborne ? 1 : 0} fuel=${s.player.fuel.toFixed(1)} ${piece?.id} in=${i.gas ? 'G' : i.brake ? 'B' : '-'} hp=${s.player.health.toFixed(2)}`);
  }
}
console.log(log.slice(-Number(process.argv[5] ?? 40)).join('\n'));
