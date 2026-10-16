import type { CosmeticSlot, LifetimeStats, MissionType, Reward } from '../data/types';
import type { UpgradeLevels } from '../data/upgrades';
import { defaultUpgradeLevels } from '../data/upgrades';
import { DEFAULT_LOADOUT, COSMETIC_BY_ID } from '../data/cosmetics';
import { VEHICLE_BY_ID } from '../data/vehicles';
import { WORLD_BY_ID } from '../data/worlds';

export const SAVE_VERSION = 1;

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  haptics: boolean;
  quality: Quality;
  batterySaver: boolean;
  controlsSwapped: boolean;
  highContrast: boolean;
  reducedShake: boolean;
  reducedEffects: boolean;
  showFps: boolean;
}

export interface MissionState {
  id: string;
  type: MissionType;
  text: string;
  target: number;
  progress: number;
  world?: string;
  reward: Reward;
  completed: boolean;
}

export interface AchievementState {
  unlockedAt: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  coins: number;
  gems: number;
  tokens: number;
  xp: number;
  level: number;
  selectedVehicle: string;
  selectedWorld: string;
  ownedVehicles: string[];
  upgrades: Record<string, UpgradeLevels>;
  ownedCosmetics: string[];
  loadouts: Record<string, Record<CosmeticSlot, string>>;
  unlockedWorlds: string[];
  visitedWorlds: string[];
  bestDistance: Record<string, number>;
  bestScore: Record<string, number>;
  stats: LifetimeStats;
  missions: { active: MissionState[]; counter: number; completedCount: number };
  achievements: Record<string, AchievementState>;
  daily: { lastClaimDate: string | null; dayIndex: number; cycles: number };
  settings: Settings;
  tutorial: { completed: boolean; garageIntroDone: boolean };
  challenge: { dateKey: string; best: number; completed: boolean; attempts: number; streak: number };
}

export const defaultSettings = (): Settings => ({
  musicVolume: 0.6,
  sfxVolume: 0.85,
  haptics: true,
  quality: 'high',
  batterySaver: false,
  controlsSwapped: false,
  highContrast: false,
  reducedShake: false,
  reducedEffects: false,
  showFps: false,
});

export const defaultStats = (): LifetimeStats => ({
  runs: 0, totalDistance: 0, bestDistance: 0, coinsCollected: 0, coinsEarned: 0, flips: 0, backflips: 0,
  frontflips: 0, perfectLandings: 0, longestWheelie: 0, longestAirtime: 0, maxAltitude: 0, noCrashRuns: 0,
  vehiclesOwned: 1, upgradesBought: 0, bestScore: 0, bestCombo: 0, worldsVisited: 0, fuelCollected: 0,
});

export const createDefaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  createdAt: Date.now(),
  coins: 0,
  gems: 0,
  tokens: 0,
  xp: 0,
  level: 1,
  selectedVehicle: 'pip',
  selectedWorld: 'hills',
  ownedVehicles: ['pip'],
  upgrades: { pip: defaultUpgradeLevels() },
  ownedCosmetics: Object.values(DEFAULT_LOADOUT),
  loadouts: { pip: { ...DEFAULT_LOADOUT } },
  unlockedWorlds: ['hills'],
  visitedWorlds: [],
  bestDistance: {},
  bestScore: {},
  stats: defaultStats(),
  missions: { active: [], counter: 0, completedCount: 0 },
  achievements: {},
  daily: { lastClaimDate: null, dayIndex: 0, cycles: 0 },
  settings: defaultSettings(),
  tutorial: { completed: false, garageIntroDone: false },
  challenge: { dateKey: '', best: 0, completed: false, attempts: 0, streak: 0 },
});

// ---------------------------------------------------------------------------
// Sanitizing: every field is validated individually so one bad value never
// costs the player their whole save.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const strArr = (v: unknown, valid: (s: string) => boolean): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.filter((s): s is string => typeof s === 'string' && valid(s)))) : [];
const numRecord = (v: unknown, valid: (k: string) => boolean): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, val] of Object.entries(v)) if (valid(k)) out[k] = num(val, 0);
  return out;
};

const sanitizeReward = (v: unknown): Reward => {
  if (!isObj(v)) return {};
  const r: Reward = {};
  if (v.coins !== undefined) r.coins = num(v.coins, 0);
  if (v.gems !== undefined) r.gems = num(v.gems, 0);
  if (v.xp !== undefined) r.xp = num(v.xp, 0);
  if (v.tokens !== undefined) r.tokens = num(v.tokens, 0);
  if (typeof v.cosmetic === 'string' && COSMETIC_BY_ID[v.cosmetic]) r.cosmetic = v.cosmetic;
  return r;
};

const MISSION_TYPES: MissionType[] = [
  'distanceRun', 'distanceTotal', 'flipsTotal', 'flipsRun', 'coinsTotal', 'runs', 'wheelie', 'altitude',
  'noCrash', 'perfectLandings', 'airtime', 'worldDistance',
];

export const sanitizeSave = (raw: unknown): SaveData => {
  const d = createDefaultSave();
  if (!isObj(raw)) return d;

  d.createdAt = num(raw.createdAt, d.createdAt);
  d.coins = Math.floor(num(raw.coins, 0));
  d.gems = Math.floor(num(raw.gems, 0));
  d.tokens = Math.floor(num(raw.tokens, 0, 0, 999));
  d.xp = num(raw.xp, 0);
  d.level = Math.floor(num(raw.level, 1, 1, 999));

  const owned = strArr(raw.ownedVehicles, (id) => !!VEHICLE_BY_ID[id]);
  d.ownedVehicles = owned.includes('pip') ? owned : ['pip', ...owned];
  d.selectedVehicle = typeof raw.selectedVehicle === 'string' && d.ownedVehicles.includes(raw.selectedVehicle) ? raw.selectedVehicle : 'pip';

  const worlds = strArr(raw.unlockedWorlds, (id) => !!WORLD_BY_ID[id]);
  d.unlockedWorlds = worlds.includes('hills') ? worlds : ['hills', ...worlds];
  d.selectedWorld = typeof raw.selectedWorld === 'string' && d.unlockedWorlds.includes(raw.selectedWorld) ? raw.selectedWorld : 'hills';
  d.visitedWorlds = strArr(raw.visitedWorlds, (id) => !!WORLD_BY_ID[id]);

  d.upgrades = {};
  for (const id of d.ownedVehicles) {
    const src: Record<string, unknown> = isObj(raw.upgrades) && isObj(raw.upgrades[id]) ? (raw.upgrades[id] as Record<string, unknown>) : {};
    const lv = defaultUpgradeLevels();
    for (const k of Object.keys(lv) as (keyof UpgradeLevels)[]) lv[k] = Math.floor(num(src[k], 1, 1, 10));
    d.upgrades[id] = lv;
  }

  d.ownedCosmetics = Array.from(new Set([...Object.values(DEFAULT_LOADOUT), ...strArr(raw.ownedCosmetics, (id) => !!COSMETIC_BY_ID[id])]));
  d.loadouts = {};
  for (const id of d.ownedVehicles) {
    const src: Record<string, unknown> = isObj(raw.loadouts) && isObj(raw.loadouts[id]) ? (raw.loadouts[id] as Record<string, unknown>) : {};
    const lo = { ...DEFAULT_LOADOUT };
    for (const slot of Object.keys(lo) as CosmeticSlot[]) {
      const c = src[slot];
      if (typeof c === 'string' && COSMETIC_BY_ID[c]?.slot === slot && d.ownedCosmetics.includes(c)) lo[slot] = c;
    }
    d.loadouts[id] = lo;
  }

  d.bestDistance = numRecord(raw.bestDistance, (k) => !!WORLD_BY_ID[k]);
  d.bestScore = numRecord(raw.bestScore, (k) => !!WORLD_BY_ID[k]);

  const st = isObj(raw.stats) ? raw.stats : {};
  for (const k of Object.keys(d.stats) as (keyof typeof d.stats)[]) d.stats[k] = num(st[k], d.stats[k]);
  d.stats.vehiclesOwned = d.ownedVehicles.length;

  if (isObj(raw.missions)) {
    d.missions.counter = Math.floor(num(raw.missions.counter, 0));
    d.missions.completedCount = Math.floor(num(raw.missions.completedCount, 0));
    if (Array.isArray(raw.missions.active)) {
      for (const m of raw.missions.active.slice(0, 3)) {
        if (!isObj(m) || typeof m.id !== 'string' || typeof m.text !== 'string') continue;
        if (!MISSION_TYPES.includes(m.type as MissionType)) continue;
        d.missions.active.push({
          id: m.id,
          type: m.type as MissionType,
          text: m.text,
          target: num(m.target, 1, 0.1),
          progress: num(m.progress, 0),
          world: typeof m.world === 'string' && WORLD_BY_ID[m.world] ? m.world : undefined,
          reward: sanitizeReward(m.reward),
          completed: bool(m.completed, false),
        });
      }
    }
  }

  if (isObj(raw.achievements)) {
    for (const [k, v] of Object.entries(raw.achievements)) {
      if (isObj(v)) d.achievements[k] = { unlockedAt: num(v.unlockedAt, Date.now()) };
    }
  }

  if (isObj(raw.daily)) {
    d.daily.lastClaimDate = typeof raw.daily.lastClaimDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily.lastClaimDate) ? raw.daily.lastClaimDate : null;
    d.daily.dayIndex = Math.floor(num(raw.daily.dayIndex, 0, 0, 6));
    d.daily.cycles = Math.floor(num(raw.daily.cycles, 0));
  }

  if (isObj(raw.settings)) {
    const s = raw.settings;
    d.settings.musicVolume = num(s.musicVolume, d.settings.musicVolume, 0, 1);
    d.settings.sfxVolume = num(s.sfxVolume, d.settings.sfxVolume, 0, 1);
    d.settings.haptics = bool(s.haptics, d.settings.haptics);
    d.settings.quality = s.quality === 'low' || s.quality === 'medium' || s.quality === 'high' ? s.quality : d.settings.quality;
    d.settings.batterySaver = bool(s.batterySaver, false);
    d.settings.controlsSwapped = bool(s.controlsSwapped, false);
    d.settings.highContrast = bool(s.highContrast, false);
    d.settings.reducedShake = bool(s.reducedShake, false);
    d.settings.reducedEffects = bool(s.reducedEffects, false);
    d.settings.showFps = bool(s.showFps, false);
  }

  if (isObj(raw.tutorial)) {
    d.tutorial.completed = bool(raw.tutorial.completed, false);
    d.tutorial.garageIntroDone = bool(raw.tutorial.garageIntroDone, false);
  }

  if (isObj(raw.challenge)) {
    const c = raw.challenge;
    d.challenge.dateKey = typeof c.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.dateKey) ? c.dateKey : '';
    d.challenge.best = Math.floor(num(c.best, 0));
    d.challenge.completed = bool(c.completed, false);
    d.challenge.attempts = Math.floor(num(c.attempts, 0));
    d.challenge.streak = Math.floor(num(c.streak, 0));
  }

  return d;
};
