import { hashString } from '../core/math';
import type { Reward } from './types';
import { VEHICLES } from './vehicles';
import { WORLDS } from './worlds';

export interface DailyChallenge {
  dateKey: string;
  seed: number;
  worldId: string;
  /** Loaner vehicle: everyone drives the same car with the same upgrades. */
  vehicleId: string;
  upgradeLevel: number;
  target: number;
  reward: Reward;
}

/**
 * The challenge for a calendar day is a pure function of the date, so every
 * player (and every attempt that day) gets the same course and car.
 */
export const dailyChallenge = (dateKey: string): DailyChallenge => {
  const h = hashString(`loony-daily-${dateKey}`);
  const world = WORLDS[h % WORLDS.length];
  const vehicle = VEHICLES[(h >>> 8) % VEHICLES.length];
  const upgradeLevel = 4 + ((h >>> 16) % 3);
  const difficulty = world.terrain.baseDifficulty;
  const target = Math.round((900 + 500 * (1 - difficulty) + ((h >>> 20) % 5) * 100) / 50) * 50;
  return {
    dateKey,
    seed: h,
    worldId: world.id,
    vehicleId: vehicle.id,
    upgradeLevel,
    target,
    reward: { coins: 600 + ((h >>> 4) % 5) * 100, gems: 5, xp: 150 },
  };
};
