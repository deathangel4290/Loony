import type { MissionTemplate, Reward } from './types';

const r50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

/** Mission templates. Targets scale with player level so they stay relevant. */
export const MISSION_TEMPLATES: MissionTemplate[] = [
  { type: 'distanceRun', text: 'Drive {n} m in a single run', target: (l) => r50(Math.min(4000, 350 + 160 * l)), minLevel: 1, weight: 1.4 },
  { type: 'distanceTotal', text: 'Drive {n} m in total', target: (l) => r50(Math.min(20000, 1500 + 600 * l)), minLevel: 1, weight: 1.0 },
  { type: 'flipsTotal', text: 'Perform {n} flips', target: (l) => Math.min(30, 3 + l), minLevel: 1, weight: 1.2 },
  { type: 'flipsRun', text: 'Land {n} flips in one run', target: (l) => Math.min(12, 2 + Math.floor(l / 3)), minLevel: 2, weight: 0.9 },
  { type: 'coinsTotal', text: 'Collect {n} coins', target: (l) => r50(Math.min(8000, 300 + 160 * l)), minLevel: 1, weight: 1.0 },
  { type: 'runs', text: 'Complete {n} runs', target: (l) => (l < 5 ? 3 : 5), minLevel: 1, weight: 0.7 },
  { type: 'wheelie', text: 'Hold a {n}-second wheelie', target: (l) => Math.min(10, 2 + Math.floor(l * 0.4)), minLevel: 2, weight: 0.8 },
  { type: 'altitude', text: 'Climb {n} m above the start', target: (l) => Math.min(150, 15 + 6 * l), minLevel: 1, weight: 0.8 },
  { type: 'noCrash', text: 'Drive {n} m and run out of fuel without crashing', target: (l) => r50(Math.min(3000, 250 + 120 * l)), minLevel: 2, weight: 0.8 },
  { type: 'perfectLandings', text: 'Nail {n} perfect landings', target: (l) => Math.min(15, 2 + Math.floor(l / 2)), minLevel: 1, weight: 1.0 },
  { type: 'airtime', text: 'Stay airborne for {n} seconds', target: (l) => Math.min(5, 1.5 + Math.floor(l / 3) * 0.5), minLevel: 1, weight: 0.8 },
  { type: 'worldDistance', text: 'Drive {n} m in {world}', target: (l) => r50(Math.min(3000, 300 + 120 * l)), minLevel: 3, weight: 0.8 },
];

export const missionReward = (level: number, seed: number): Reward => {
  const reward: Reward = {
    coins: Math.round((180 + 70 * level) / 10) * 10,
    xp: 60 + 18 * level,
  };
  const roll = seed % 6;
  if (roll === 0) reward.gems = 3 + Math.floor(level / 5);
  else if (roll === 1) reward.tokens = 1;
  return reward;
};

export const MISSION_SLOTS = 3;
