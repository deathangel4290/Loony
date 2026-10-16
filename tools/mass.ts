import { World, Vec2 } from 'planck';
import { VEHICLES } from '../src/data/vehicles';
import { VehiclePhysics } from '../src/game/VehiclePhysics';
for (const v of VEHICLES) {
  const w = new World({ gravity: new Vec2(0, -11.5) });
  const vp = new VehiclePhysics(w, v, v.physics, 0, 5);
  const c = vp.chassis;
  const lc = c.getLocalCenter();
  console.log(v.id.padEnd(10), 'chassis', c.getMass().toFixed(2), 'I', c.getInertia().toFixed(2), 'com', lc.x.toFixed(2), lc.y.toFixed(2), 'wheels', vp.rearWheel.getMass().toFixed(2), vp.frontWheel.getMass().toFixed(2), 'total', vp.mass.toFixed(2), 'torque/weight', (v.physics.motorTorque / v.physics.rearWheel.radius / (vp.mass * 11.5)).toFixed(2));
}
