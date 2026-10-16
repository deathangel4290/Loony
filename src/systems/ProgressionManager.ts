import type { EventBus } from '../core/EventBus';
import { levelUpReward, xpForNextLevel } from '../data/rewards';
import type { Reward } from '../data/types';
import type { GameEvents } from './events';
import type { SaveManager } from './SaveManager';

export interface XpSnapshot {
  level: number;
  xp: number;
  needed: number;
}

/** Player XP and level. Level-ups grant rewards through the supplied granter. */
export class ProgressionManager {
  constructor(
    private save: SaveManager,
    private events: EventBus<GameEvents>,
    private grant: (r: Reward) => void,
  ) {}

  get level() { return this.save.data.level; }

  snapshot(): XpSnapshot {
    return { level: this.save.data.level, xp: this.save.data.xp, needed: xpForNextLevel(this.save.data.level) };
  }

  /** Adds XP and returns the list of levels reached. */
  addXp(amount: number): number[] {
    const reached: number[] = [];
    if (!(amount > 0)) return reached;
    const d = this.save.data;
    d.xp += Math.round(amount);
    let needed = xpForNextLevel(d.level);
    while (d.xp >= needed && d.level < 999) {
      d.xp -= needed;
      d.level += 1;
      reached.push(d.level);
      const reward = levelUpReward(d.level);
      this.grant(reward);
      this.events.emit('levelUp', { level: d.level, reward });
      needed = xpForNextLevel(d.level);
    }
    this.save.markDirty();
    this.events.emit('xp', this.snapshot());
    return reached;
  }
}
