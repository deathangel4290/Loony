export type EndReason = 'crash' | 'fuel' | 'lava' | 'damage' | 'flipped' | 'quit';

/** Everything a finished run reports to the progression systems. */
export type RunMode = 'normal' | 'challenge';

export interface RunSummary {
  mode: RunMode;
  worldId: string;
  vehicleId: string;
  seed: number;
  distance: number;
  score: number;
  coinsCollected: number;
  trickCoins: number;
  distanceCoins: number;
  coinsEarned: number;
  trickPoints: number;
  xpEarned: number;
  flips: number;
  backflips: number;
  frontflips: number;
  perfectLandings: number;
  tricks: number;
  longestWheelie: number;
  longestAirtime: number;
  maxAltitude: number;
  bestCombo: number;
  fuelCollected: number;
  endReason: EndReason;
  duration: number;
}

export const endReasonText: Record<EndReason, string> = {
  crash: 'WIPEOUT!',
  fuel: 'OUT OF FUEL',
  lava: 'MELTED!',
  damage: 'WRECKED!',
  flipped: 'FLIPPED!',
  quit: 'RUN ENDED',
};
