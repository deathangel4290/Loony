import type { EventBus } from '../core/EventBus';
import type { GameEvents } from './events';
import type { Settings } from './SaveData';
import type { SaveManager } from './SaveManager';

export class SettingsManager {
  constructor(private save: SaveManager, private events: EventBus<GameEvents>) {}

  get values(): Settings {
    return this.save.data.settings;
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    if (this.save.data.settings[key] === value) return;
    this.save.data.settings[key] = value;
    this.save.markDirty();
    this.apply();
  }

  apply(): void {
    const s = this.values;
    document.documentElement.classList.toggle('high-contrast', s.highContrast);
    document.documentElement.classList.toggle('reduced-motion', s.reducedEffects);
    this.events.emit('settings', s);
  }

  /** Pixel ratio cap for the game canvas given quality & battery settings. */
  pixelRatio(deviceRatio: number): number {
    const s = this.values;
    if (s.batterySaver) return Math.min(deviceRatio, 1.25);
    const cap = s.quality === 'high' ? 2.5 : s.quality === 'medium' ? 1.75 : 1.25;
    return Math.min(deviceRatio, cap);
  }

  /** Max simultaneous particles. */
  particleBudget(): number {
    const s = this.values;
    if (s.reducedEffects) return 120;
    return s.quality === 'high' ? 520 : s.quality === 'medium' ? 320 : 180;
  }

  targetFps(): number {
    return this.values.batterySaver ? 30 : 60;
  }
}
