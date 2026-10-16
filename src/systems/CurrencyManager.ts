import type { EventBus } from '../core/EventBus';
import type { GameEvents } from './events';
import type { SaveManager } from './SaveManager';

export type Currency = 'coins' | 'gems' | 'tokens';

/** Owns every balance change. Premium currency (gems) is earn-only for now. */
export class CurrencyManager {
  constructor(private save: SaveManager, private events: EventBus<GameEvents>) {}

  get coins() { return this.save.data.coins; }
  get gems() { return this.save.data.gems; }
  get tokens() { return this.save.data.tokens; }

  balance(c: Currency): number {
    return this.save.data[c];
  }

  add(c: Currency, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.save.data[c] += Math.floor(amount);
    if (c === 'coins') this.save.data.stats.coinsEarned += Math.floor(amount);
    this.changed();
  }

  canAfford(price: number, c: Currency = 'coins'): boolean {
    return this.save.data[c] >= price;
  }

  spend(price: number, c: Currency = 'coins'): boolean {
    if (price < 0 || !this.canAfford(price, c)) return false;
    this.save.data[c] -= price;
    this.changed();
    return true;
  }

  private changed(): void {
    this.save.markDirty();
    this.events.emit('currency', { coins: this.coins, gems: this.gems, tokens: this.tokens });
  }
}
