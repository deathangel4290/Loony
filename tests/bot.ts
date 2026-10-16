import { GameSession } from '../src/game/GameSession';
import { wrapAngle } from '../src/core/math';

/**
 * Simple autopilot used for headless balance/regression tests: holds gas,
 * levels the car to the terrain in the air and eases off big wheelies.
 */
export const botInput = (s: GameSession, skill = 1): { gas: boolean; brake: boolean } => {
  const v = s.player.vehicle;
  const c = v.chassis;
  const angle = wrapAngle(c.getAngle());
  if (v.airborne) {
    const vel = c.getLinearVelocity();
    const x = c.getPosition().x + vel.x * 0.35;
    const target = Math.atan(s.gen.slopeAt(x));
    const err = wrapAngle(angle - target);
    const w = c.getAngularVelocity();
    const predicted = err + w * 0.18 * skill;
    if (predicted > 0.12) return { gas: true, brake: false };
    if (predicted < -0.12) return { gas: false, brake: true };
    return { gas: false, brake: false };
  }
  const x = c.getPosition().x;
  const slope = Math.atan(s.gen.slopeAt(x));
  const rel = angle - slope;
  if (rel > 0.75) return { gas: false, brake: false };
  // Ease off before crests and jumps when carrying a lot of speed.
  const speed = v.speed;
  const look = Math.min(18, speed * 0.9);
  const slopeAhead = Math.atan(s.gen.slopeAt(x + look));
  const crest = slope - slopeAhead;
  if (speed > 13 && crest > 0.3) return { gas: false, brake: speed > 18 && crest > 0.5 };
  return { gas: true, brake: false };
};

export interface SimResult {
  distance: number;
  reason: string;
  time: number;
  flips: number;
  maxImpact: number;
  coins: number;
  fuel: number;
  avgSpeed: number;
}

export const simulate = (s: GameSession, maxTime = 400, skill = 1): SimResult => {
  let maxImpact = 0;
  const dt = 1 / 60;
  while (s.state !== 'ended' && s.time < maxTime) {
    const i = botInput(s, skill);
    s.input.gas = i.gas;
    s.input.brake = i.brake;
    s.update(dt);
    maxImpact = Math.max(maxImpact, s.player.vehicle.impact);
  }
  return {
    distance: Math.round(s.distance),
    reason: s.player.endReason ?? 'timeout',
    time: Math.round(s.time),
    flips: s.tricks.flips,
    maxImpact: Math.round(maxImpact * 10) / 10,
    coins: s.coinValue,
    fuel: s.fuelCollected,
    avgSpeed: Math.round((s.distance / Math.max(1, s.time)) * 10) / 10,
  };
};
