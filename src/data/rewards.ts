import type { Reward } from './types';

export interface DailyRewardDay {
  day: number;
  label: string;
  /** Reward for the first time through the cycle. */
  first: Reward;
  /** Reward on later cycles (cosmetics can only be granted once). */
  repeat: Reward;
}

export const DAILY_REWARDS: DailyRewardDay[] = [
  { day: 1, label: 'Coins', first: { coins: 200 }, repeat: { coins: 300 } },
  { day: 2, label: 'Coins', first: { coins: 400 }, repeat: { coins: 500 } },
  { day: 3, label: 'Upgrade Token', first: { tokens: 1 }, repeat: { tokens: 1 } },
  { day: 4, label: 'Coins', first: { coins: 800 }, repeat: { coins: 900 } },
  { day: 5, label: 'Cosmetic', first: { cosmetic: 'decal_loony' }, repeat: { gems: 8 } },
  { day: 6, label: 'Big Coins', first: { coins: 2000 }, repeat: { coins: 2500 } },
  { day: 7, label: 'Jackpot', first: { gems: 20, cosmetic: 'wheels_gold' }, repeat: { gems: 15, coins: 4000 } },
];

/** XP needed to go from `level` to `level + 1`. */
export const xpForNextLevel = (level: number): number => Math.round(150 * Math.pow(level, 1.32));

export const levelUpReward = (newLevel: number): Reward => ({
  coins: 150 * newLevel,
  gems: newLevel % 5 === 0 ? 5 : 0,
  tokens: newLevel % 3 === 0 ? 1 : 0,
});
