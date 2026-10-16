import { EventBus } from '../core/EventBus';
import { COSMETIC_BY_ID } from '../data/cosmetics';
import type { AchievementDef, Reward } from '../data/types';
import { AchievementManager } from './AchievementManager';
import { AudioManager } from './AudioManager';
import { CurrencyManager } from './CurrencyManager';
import { DailyRewardManager } from './DailyRewardManager';
import { ChallengeManager, type ChallengeResult } from './ChallengeManager';
import type { GameEvents } from './events';
import { GarageManager } from './GarageManager';
import { HapticsManager } from './HapticsManager';
import { MissionManager } from './MissionManager';
import { ProgressionManager, type XpSnapshot } from './ProgressionManager';
import type { RunSummary } from './RunSummary';
import type { MissionState } from './SaveData';
import { SaveManager } from './SaveManager';
import { SettingsManager } from './SettingsManager';
import type { StorageBackend } from './Storage';
import { VehicleUpgradeSystem } from './VehicleUpgradeSystem';
import { WorldManager } from './WorldManager';
import { GhostStore } from '../game/Ghost';

export interface RunRewards {
  summary: RunSummary;
  previousBest: number;
  newBest: boolean;
  xpBefore: XpSnapshot;
  xpAfter: XpSnapshot;
  levelsGained: number[];
  missionsCompleted: MissionState[];
  achievements: AchievementDef[];
  challenge: ChallengeResult | null;
}

/** Composition root for all persistent/meta systems. */
export class Services {
  readonly events = new EventBus<GameEvents>();
  readonly save: SaveManager;
  readonly settings: SettingsManager;
  readonly currency: CurrencyManager;
  readonly progression: ProgressionManager;
  readonly upgrades: VehicleUpgradeSystem;
  readonly garage: GarageManager;
  readonly worlds: WorldManager;
  readonly missions: MissionManager;
  readonly achievements: AchievementManager;
  readonly daily: DailyRewardManager;
  readonly challenge: ChallengeManager;
  readonly audio = new AudioManager();
  readonly haptics = new HapticsManager();

  readonly ghosts: GhostStore;

  constructor(storage: StorageBackend) {
    this.save = new SaveManager(storage);
    this.ghosts = new GhostStore(storage);
    const grant = (r: Reward) => this.grant(r);
    this.settings = new SettingsManager(this.save, this.events);
    this.currency = new CurrencyManager(this.save, this.events);
    this.progression = new ProgressionManager(this.save, this.events, grant);
    this.upgrades = new VehicleUpgradeSystem(this.save, this.currency);
    this.garage = new GarageManager(this.save, this.currency, this.events);
    this.worlds = new WorldManager(this.save, this.currency, this.events);
    this.missions = new MissionManager(this.save, this.events, grant);
    this.achievements = new AchievementManager(this.save, this.events, grant);
    this.daily = new DailyRewardManager(this.save, grant);
    this.challenge = new ChallengeManager(this.save, grant);

    this.events.on('settings', (s) => {
      this.audio.setVolumes(s.musicVolume, s.sfxVolume);
      this.haptics.enabled = s.haptics;
    });
  }

  async init(): Promise<void> {
    await this.save.load();
    this.missions.ensure();
    this.settings.apply();
  }

  /** Grants any reward bundle. Duplicate cosmetics convert to gems. */
  grant(r: Reward): void {
    if (r.coins) this.currency.add('coins', r.coins);
    if (r.gems) this.currency.add('gems', r.gems);
    if (r.tokens) this.currency.add('tokens', r.tokens);
    if (r.cosmetic && COSMETIC_BY_ID[r.cosmetic]) {
      if (!this.garage.grantCosmetic(r.cosmetic)) this.currency.add('gems', 10);
    }
    if (r.xp) this.progression.addXp(r.xp);
  }

  /** Applies a finished run to every progression system, then saves. */
  finishRun(summary: RunSummary): RunRewards {
    const d = this.save.data;
    // Challenge runs use a loaner car on a fixed course, so they keep their own
    // best and don't touch the per-world records.
    const isChallenge = summary.mode === 'challenge';
    const previousBest = isChallenge ? this.challenge.best : d.bestDistance[summary.worldId] ?? 0;
    const newBest = summary.distance > previousBest && summary.distance >= 1;
    if (newBest && !isChallenge) d.bestDistance[summary.worldId] = Math.floor(summary.distance);
    if (!isChallenge) d.bestScore[summary.worldId] = Math.max(d.bestScore[summary.worldId] ?? 0, summary.score);
    const challenge = isChallenge ? this.challenge.recordRun(summary) : null;
    if (!d.visitedWorlds.includes(summary.worldId)) d.visitedWorlds.push(summary.worldId);

    const s = d.stats;
    s.runs += 1;
    s.totalDistance += Math.floor(summary.distance);
    s.bestDistance = Math.max(s.bestDistance, Math.floor(summary.distance));
    s.coinsCollected += summary.coinsCollected;
    s.flips += summary.flips;
    s.backflips += summary.backflips;
    s.frontflips += summary.frontflips;
    s.perfectLandings += summary.perfectLandings;
    s.longestWheelie = Math.max(s.longestWheelie, summary.longestWheelie);
    s.longestAirtime = Math.max(s.longestAirtime, summary.longestAirtime);
    s.maxAltitude = Math.max(s.maxAltitude, summary.maxAltitude);
    if (summary.endReason === 'fuel') s.noCrashRuns += 1;
    s.bestScore = Math.max(s.bestScore, summary.score);
    s.bestCombo = Math.max(s.bestCombo, summary.bestCombo);
    s.worldsVisited = d.visitedWorlds.length;
    s.fuelCollected += summary.fuelCollected;

    const xpBefore = this.progression.snapshot();
    this.currency.add('coins', summary.coinsEarned);
    const levelsGained = this.progression.addXp(summary.xpEarned);
    const missionsCompleted = this.missions.applyRun(summary);
    const achievements = this.achievements.check();
    const xpAfter = this.progression.snapshot();
    this.save.markDirty();
    void this.save.flush();
    return { summary, previousBest, newBest, xpBefore, xpAfter, levelsGained, missionsCompleted, achievements, challenge };
  }
}
