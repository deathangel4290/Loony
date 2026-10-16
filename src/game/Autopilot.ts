import { wrapAngle } from '../core/math';
import type { GameSession } from './GameSession';
import type { DriveInput } from './VehiclePhysics';

/**
 * Simple driver: holds the throttle, levels the car to the terrain in the air
 * and eases off before crests. Powers the menu attract mode and headless
 * balance tests.
 */
export const autopilot = (s: GameSession, maxSpeed = Infinity, out: DriveInput = { gas: false, brake: false }): DriveInput => {
  const v = s.player.vehicle;
  const c = v.chassis;
  const angle = wrapAngle(c.getAngle());
  out.gas = false;
  out.brake = false;
  if (v.airborne) {
    const vel = c.getLinearVelocity();
    const x = c.getPosition().x + vel.x * 0.35;
    const target = Math.atan(s.gen.slopeAt(x));
    const predicted = wrapAngle(angle - target) + c.getAngularVelocity() * 0.18;
    if (predicted > 0.12) out.gas = true;
    else if (predicted < -0.12) out.brake = true;
    return out;
  }
  const x = c.getPosition().x;
  const slope = Math.atan(s.gen.slopeAt(x));
  if (angle - slope > 0.75) return out;
  const speed = v.speed;
  const slopeAhead = Math.atan(s.gen.slopeAt(x + Math.min(18, speed * 0.9)));
  const crest = slope - slopeAhead;
  if (speed > 13 && crest > 0.3) {
    out.brake = speed > 18 && crest > 0.5;
    return out;
  }
  out.gas = v.forwardSpeed < maxSpeed;
  return out;
};
