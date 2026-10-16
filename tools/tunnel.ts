import { GameSession } from '../src/game/GameSession';
import { getVehicle } from '../src/data/vehicles';
import { getWorld } from '../src/data/worlds';
import { botInput } from '../tests/bot';
const [vid = 'pip', wid = 'hills', seed = '2'] = process.argv.slice(2);
const v = getVehicle(vid);
const s = new GameSession({ world: getWorld(wid), vehicle: v, tuning: v.physics, seed: Number(seed) * 7919 });
let prevLine = '';
while (s.time < 60 && s.state === 'running') {
  const i = botInput(s); s.input.gas = i.gas; s.input.brake = i.brake;
  s.update(1 / 120);
  const vp = s.player.vehicle;
  for (const [name, b, r] of [['rear', vp.rearWheel, v.physics.rearWheel.radius], ['front', vp.frontWheel, v.physics.frontWheel.radius]] as const) {
    const p = b.getPosition();
    const g = s.gen.surfaceAt(p.x);
    const line = `t=${s.time.toFixed(3)} ${name} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} ground=${g.toFixed(2)} vel=${b.getLinearVelocity().y.toFixed(1)} tr=${(name === 'rear' ? vp.rearJoint : vp.frontJoint).getJointTranslation().toFixed(2)} impact=${vp.impact.toFixed(1)} chassisVy=${vp.chassis.getLinearVelocity().y.toFixed(1)}`;
    if (p.y < g - 0.05) { console.log('PREV', prevLine); console.log('BELOW', line); process.exit(0); }
    if (name === 'rear') prevLine = line;
  }
}
console.log('no tunnel');
