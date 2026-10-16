import type { AchievementDef, Reward } from '../data/types';
import type { MissionState, Settings } from './SaveData';

export interface Toast {
  title: string;
  subtitle?: string;
  icon?: string;
  tone?: 'gold' | 'green' | 'blue' | 'purple';
}

export interface GameEvents {
  currency: { coins: number; gems: number; tokens: number };
  xp: { level: number; xp: number; needed: number };
  levelUp: { level: number; reward: Reward };
  missionCompleted: { mission: MissionState };
  achievementUnlocked: { def: AchievementDef };
  toast: Toast;
  settings: Settings;
  profile: void;
}
