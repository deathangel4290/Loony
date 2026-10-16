import type { EventBus } from '../core/EventBus';
import type { WorldDef } from '../data/types';
import { getWorld, WORLDS } from '../data/worlds';
import type { CurrencyManager } from './CurrencyManager';
import type { GameEvents } from './events';
import type { PurchaseResult } from './GarageManager';
import type { SaveManager } from './SaveManager';

export class WorldManager {
  constructor(private save: SaveManager, private currency: CurrencyManager, private events: EventBus<GameEvents>) {}

  get selected(): WorldDef {
    return getWorld(this.save.data.selectedWorld);
  }

  isUnlocked(id: string): boolean {
    return this.save.data.unlockedWorlds.includes(id);
  }

  select(id: string): boolean {
    if (!this.isUnlocked(id)) return false;
    this.save.data.selectedWorld = id;
    this.save.markDirty();
    this.events.emit('profile', undefined);
    return true;
  }

  canUnlock(w: WorldDef): PurchaseResult {
    if (this.isUnlocked(w.id)) return 'owned';
    if (this.save.data.level < w.requiredLevel) return 'level';
    if (!this.currency.canAfford(w.price)) return 'funds';
    return 'ok';
  }

  unlock(id: string): PurchaseResult {
    const w = getWorld(id);
    const status = this.canUnlock(w);
    if (status !== 'ok') return status;
    this.currency.spend(w.price);
    this.grant(id);
    return 'ok';
  }

  grant(id: string): void {
    if (!this.isUnlocked(id)) this.save.data.unlockedWorlds.push(id);
    this.save.markDirty();
    this.events.emit('profile', undefined);
  }

  best(id: string): number {
    return this.save.data.bestDistance[id] ?? 0;
  }

  nextLocked(): WorldDef | null {
    return WORLDS.find((w) => !this.isUnlocked(w.id)) ?? null;
  }
}
