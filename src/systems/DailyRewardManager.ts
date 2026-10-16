import { DAILY_REWARDS } from '../data/rewards';
import type { Reward } from '../data/types';
import type { SaveManager } from './SaveManager';

export const localDateKey = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export type DayState = 'claimed' | 'today' | 'locked';

/**
 * 7-day reward calendar. One claim per calendar day; missing a day doesn't
 * reset progress (friendlier than a hard streak). Clock rollbacks can't be
 * used to claim twice because the date must strictly advance.
 */
export class DailyRewardManager {
  constructor(private save: SaveManager, private grant: (r: Reward) => void, private now: () => Date = () => new Date()) {}

  canClaim(): boolean {
    const last = this.save.data.daily.lastClaimDate;
    const today = localDateKey(this.now());
    return last === null || today > last;
  }

  get dayIndex(): number {
    return this.save.data.daily.dayIndex;
  }

  rewardFor(index: number): Reward {
    const day = DAILY_REWARDS[index];
    const firstCycle = this.save.data.daily.cycles === 0;
    return firstCycle ? day.first : day.repeat;
  }

  states(): DayState[] {
    const can = this.canClaim();
    return DAILY_REWARDS.map((_, i) => {
      if (i < this.dayIndex) return 'claimed';
      if (i === this.dayIndex) return can ? 'today' : 'locked';
      return 'locked';
    });
  }

  claim(): Reward | null {
    if (!this.canClaim()) return null;
    const d = this.save.data.daily;
    const reward = this.rewardFor(d.dayIndex);
    this.grant(reward);
    d.lastClaimDate = localDateKey(this.now());
    d.dayIndex += 1;
    if (d.dayIndex >= DAILY_REWARDS.length) {
      d.dayIndex = 0;
      d.cycles += 1;
    }
    this.save.markDirty();
    return reward;
  }
}
