import type { EventBus } from '../core/EventBus';
import { ACHIEVEMENTS } from '../data/achievements';
import type { AchievementDef, Reward } from '../data/types';
import type { GameEvents } from './events';
import type { SaveManager } from './SaveManager';

export class AchievementManager {
  constructor(
    private save: SaveManager,
    private events: EventBus<GameEvents>,
    private grant: (r: Reward) => void,
  ) {}

  isUnlocked(id: string): boolean {
    return !!this.save.data.achievements[id];
  }

  progress(def: AchievementDef): number {
    if (def.stat === 'special') return this.isUnlocked(def.id) ? 1 : 0;
    return Math.min(1, (this.save.data.stats[def.stat] ?? 0) / def.goal);
  }

  /** Unlocks anything newly earned and grants its reward. */
  check(): AchievementDef[] {
    const unlocked: AchievementDef[] = [];
    const stats = this.save.data.stats;
    for (const def of ACHIEVEMENTS) {
      if (this.isUnlocked(def.id) || def.stat === 'special') continue;
      if ((stats[def.stat] ?? 0) >= def.goal) {
        this.save.data.achievements[def.id] = { unlockedAt: Date.now() };
        this.grant(def.reward);
        unlocked.push(def);
        this.events.emit('achievementUnlocked', { def });
      }
    }
    if (unlocked.length) this.save.markDirty();
    return unlocked;
  }

  get unlockedCount(): number {
    return ACHIEVEMENTS.filter((a) => this.isUnlocked(a.id)).length;
  }
}
