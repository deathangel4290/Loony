import { GameSession } from '../src/game/GameSession';
import { getVehicle } from '../src/data/vehicles';
import { getWorld } from '../src/data/worlds';
import { botInput } from '../tests/bot';
import { tagOf } from '../src/game/VehiclePhysics';
const v = getVehicle('pip');
const s = new GameSession({ world: getWorld(process.argv[4] ?? 'hills'), vehicle: v, tuning: v.physics, seed: Number(process.argv[2] ?? 2) * 7919 });
while (s.time < Number(process.argv[3] ?? 36)) { const i = botInput(s); s.input.gas = i.gas; s.input.brake = i.brake; s.update(1 / 60); }
const vp = s.player.vehicle;
for (const [name, b] of [['chassis', vp.chassis], ['rear', vp.rearWheel], ['front', vp.frontWheel]] as const) {
  const p = b.getPosition();
  console.log(name, p.x.toFixed(2), p.y.toFixed(2), 'w', b.getAngularVelocity().toFixed(2), 'awake', b.isAwake());
  for (let ce = b.getContactList(); ce; ce = ce.next) {
    const c = ce.contact;
    const other = c.getFixtureA().getBody() === b ? c.getFixtureB() : c.getFixtureA();
    console.log('  contact', tagOf(other), 'touching', c.isTouching(), 'otherpos', other.getBody().getPosition().x.toFixed(1), other.getType());
  }
}
console.log('props near', s.terrain.props.filter(p => Math.abs(p.x - 289) < 5).map(p => [p.spawn.kind, p.x.toFixed(1), p.y.toFixed(1), !!p.body]));
console.log('rear motor', vp.rearJoint.isMotorEnabled(), vp.rearJoint.getMotorSpeed(), vp.rearJoint.getMaxMotorTorque());
for (let x = 284; x < 294; x += 0.5) process.stdout.write(`${x}:${s.gen.heightAt(x).toFixed(2)} `);
