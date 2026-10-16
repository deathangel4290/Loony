export interface Vec { x: number; y: number }

export type DriveType = 'rear' | 'front' | 'all';
export type VehicleTrait = 'none' | 'longTravel' | 'burnout' | 'awd' | 'crusher' | 'aero' | 'gyro';
export type VehicleStyle = 'hatch' | 'buggy' | 'muscle' | 'rally' | 'monster' | 'super' | 'future';

export interface WheelDef { x: number; y: number; radius: number }

/** Raw, un-upgraded physical tuning for a vehicle. Units: meters, kg-ish, seconds. */
export interface VehiclePhysicsDef {
  /** Convex polygons (local space, y up) that make up the chassis collision. */
  bodyParts: Vec[][];
  bodyDensity: number;
  /** Shifts the computed center of mass. Lower = more stable. */
  comOffset: Vec;
  /** Driver head position. Touching the ground with it ends the run. */
  head: Vec;
  headRadius: number;
  rearWheel: WheelDef;
  frontWheel: WheelDef;
  wheelDensity: number;
  wheelFriction: number;
  suspensionHz: number;
  suspensionDamping: number;
  /** Max compression before the bump stop engages (m). */
  suspensionTravel: number;
  motorTorque: number;
  /** Top speed in m/s. */
  topSpeed: number;
  reverseSpeed: number;
  brakeTorque: number;
  /** Target airborne spin rate (rad/s) and how fast it is reached (1/s). */
  airSpin: number;
  airResponse: number;
  /** Seconds of full throttle on a full tank. */
  fuelCapacity: number;
  /** Change in velocity (m/s) the chassis can absorb before taking damage. */
  impactTolerance: number;
  /** Extra downward force per (m/s)^2 while grounded. */
  downforce: number;
}

export interface EngineSoundDef {
  /** Idle frequency (Hz) of the fundamental. */
  idle: number;
  /** Frequency at redline. */
  redline: number;
  wave: OscillatorType;
  /** 0..1 how much low rumble/sub layer. */
  rumble: number;
  /** Lowpass brightness 0..1. */
  bright: number;
}

export interface VehicleDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  requiredLevel: number;
  /** Base coin cost for upgrade level 2; later levels scale from this. */
  upgradeCostBase: number;
  drive: DriveType;
  trait: VehicleTrait;
  traitName: string;
  traitDescription: string;
  physics: VehiclePhysicsDef;
  style: VehicleStyle;
  defaultPaint: string;
  engine: EngineSoundDef;
}

export type UpgradeId = 'engine' | 'tires' | 'suspension' | 'fuel' | 'air' | 'brakes';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  description: string;
  maxLevel: number;
  /** Effect label for one level, e.g. "+9% ACCELERATION". */
  perLevelLabel: string;
}

export type SurfaceKind = 'grass' | 'sand' | 'snow' | 'road' | 'rock' | 'moon';
export type WorldParticle = 'pollen' | 'dust' | 'snow' | 'paper' | 'embers' | 'stardust';
export type DecorKind =
  | 'tree' | 'bush' | 'rock' | 'flower' | 'fence'
  | 'cactus' | 'mesa' | 'skull' | 'tumble'
  | 'pine' | 'snowrock' | 'snowman'
  | 'lamp' | 'sign' | 'hydrant' | 'bin'
  | 'deadtree' | 'vent' | 'crystal'
  | 'moonrock' | 'dish' | 'lander' | 'moonflag';
export type PropKind = 'crate' | 'barrel' | 'cone' | 'snowman' | 'boulder' | 'hay' | 'tire';
export type TimeOfDay = 'day' | 'sunset' | 'night';
export type SkyFeature = 'clouds' | 'sunset' | 'aurora' | 'skyline' | 'smoke' | 'space';

export interface WorldPalette {
  skyTop: string;
  skyBottom: string;
  sun: string;
  far: string;
  mid: string;
  near: string;
  surface: string;
  surfaceEdge: string;
  topsoil: string;
  dirt: string;
  dirtDark: string;
  speck: string;
  accent: string;
  fog: string;
}

export interface WorldTerrainDef {
  surface: SurfaceKind;
  /** 0..1 added to the distance-based difficulty. */
  baseDifficulty: number;
  /** Relative weight multipliers for terrain pieces. */
  pieceWeights: Partial<Record<TerrainPieceId, number>>;
  groundFriction: number;
  /** Chance that a flat-ish piece is icy (snow world). */
  iceChance: number;
  fuelSpacingMul: number;
}

export type TerrainPieceId =
  | 'rolling' | 'hill' | 'valley' | 'climb' | 'descent' | 'kicker' | 'gap'
  | 'bridge' | 'bumps' | 'plateau' | 'lava' | 'rooftops' | 'doubleHill';

export interface MusicDef {
  bpm: number;
  /** MIDI note of the tonic. */
  root: number;
  scale: number[];
  /** Chord degrees (0-based, into scale) per bar. */
  progression: number[];
  lead: OscillatorType;
  bass: OscillatorType;
  swing: number;
  drums: 'four' | 'break' | 'half' | 'soft';
}

export interface WorldDef {
  id: string;
  name: string;
  tagline: string;
  price: number;
  requiredLevel: number;
  palette: WorldPalette;
  terrain: WorldTerrainDef;
  decor: DecorKind[];
  props: PropKind[];
  particle: WorldParticle;
  sky: SkyFeature;
  time: TimeOfDay;
  coinMultiplier: number;
  /** Multiplier on gravity (1 = Earth-like). */
  gravityScale?: number;
  music: MusicDef;
}

export type CosmeticSlot = 'paint' | 'wheels' | 'decal' | 'trail' | 'exhaust' | 'accessory';

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  /** Color for paint, style key otherwise. */
  value: string;
  price: number;
  currency: 'coins' | 'gems';
  /** Items that can't be bought but are granted by rewards. */
  rewardOnly?: boolean;
}

export type MissionType =
  | 'distanceRun' | 'distanceTotal' | 'flipsTotal' | 'flipsRun' | 'coinsTotal'
  | 'runs' | 'wheelie' | 'altitude' | 'noCrash' | 'perfectLandings' | 'airtime' | 'worldDistance';

export interface MissionTemplate {
  type: MissionType;
  /** Text with {n} for the target and {world} for the world name. */
  text: string;
  /** Target as a function of player level. */
  target: (level: number) => number;
  minLevel: number;
  weight: number;
}

export interface Reward {
  coins?: number;
  gems?: number;
  xp?: number;
  tokens?: number;
  cosmetic?: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  stat: keyof LifetimeStats | 'special';
  goal: number;
  reward: Reward;
  hidden?: boolean;
}

export interface LifetimeStats {
  runs: number;
  totalDistance: number;
  bestDistance: number;
  coinsCollected: number;
  coinsEarned: number;
  flips: number;
  backflips: number;
  frontflips: number;
  perfectLandings: number;
  longestWheelie: number;
  longestAirtime: number;
  maxAltitude: number;
  noCrashRuns: number;
  vehiclesOwned: number;
  upgradesBought: number;
  bestScore: number;
  bestCombo: number;
  worldsVisited: number;
  fuelCollected: number;
}
