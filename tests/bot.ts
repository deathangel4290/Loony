import type { GameSession } from '../src/game/GameSession';
import { autopilot } from '../src/game/Autopilot';

export const botInput = (s: GameSession) => autopilot(s);

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

export const simulate = (s: GameSession, maxTime = 400): SimResult => {
  let maxImpact = 0;
  const dt = 1 / 60;
  while (s.state !== 'ended' && s.time < maxTime) {
    const i = autopilot(s);
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
