import { GameSession } from '../src/game/GameSession';
import { getVehicle } from '../src/data/vehicles';
import { getWorld } from '../src/data/worlds';
import { botInput } from '../tests/bot';
import { wrapAngle } from '../src/core/math';

const [vid = 'pip', wid = 'hills', seedArg = '1', t0 = '17', t1 = '19'] = process.argv.slice(2);
const v = getVehicle(vid);
const s = new GameSession({ world: getWorld(wid), vehicle: v, tuning: v.physics, seed: Number(seedArg) * 7919 });
while (s.state !== 'ended' && s.time < Number(t1)) {
  const i = botInput(s);
  s.input.gas = i.gas;
  s.input.brake = i.brake;
  s.update(1 / 60);
  const vp = s.player.vehicle;
  const c = vp.chassis;
  if (s.time > Number(t0)) {
    console.log(`t=${s.time.toFixed(2)} x=${c.getPosition().x.toFixed(2)} ang=${(wrapAngle(c.getAngle()) * 57.3).toFixed(0)} w=${c.getAngularVelocity().toFixed(2)} v=${vp.forwardSpeed.toFixed(1)} R${vp.rearGrounded ? 1 : 0}F${vp.frontGrounded ? 1 : 0}B${vp.bodyGrounded ? 1 : 0} trR=${vp.rearJoint.getJointTranslation().toFixed(2)} trF=${vp.frontJoint.getJointTranslation().toFixed(2)} in=${i.gas ? 'G' : i.brake ? 'B' : '-'} wR=${vp.rearWheel.getAngularVelocity().toFixed(1)} wF=${vp.frontWheel.getAngularVelocity().toFixed(1)}`);
  }
}
