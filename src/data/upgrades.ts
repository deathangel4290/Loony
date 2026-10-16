import type { UpgradeDef, UpgradeId, VehicleDef, VehiclePhysicsDef } from './types';

export const MAX_UPGRADE_LEVEL = 10;

export const UPGRADES: UpgradeDef[] = [
  { id: 'engine', name: 'Engine', icon: 'engine', description: 'More torque and a higher top speed.', maxLevel: MAX_UPGRADE_LEVEL, perLevelLabel: '+9% ACCELERATION' },
  { id: 'tires', name: 'Tires', icon: 'tire', description: 'Stickier rubber for steep climbs and slick ground.', maxLevel: MAX_UPGRADE_LEVEL, perLevelLabel: '+6% TRACTION' },
  { id: 'suspension', name: 'Suspension', icon: 'spring', description: 'Better damping and tougher landings.', maxLevel: MAX_UPGRADE_LEVEL, perLevelLabel: '+8% LANDING STABILITY' },
  { id: 'fuel', name: 'Fuel Tank', icon: 'fuel', description: 'Drive further between fuel cans.', maxLevel: MAX_UPGRADE_LEVEL, perLevelLabel: '+12% FUEL CAPACITY' },
  { id: 'air', name: 'Air Control', icon: 'spin', description: 'Spin faster and correct quicker in the air.', maxLevel: MAX_UPGRADE_LEVEL, perLevelLabel: '+8% AIR ROTATION' },
  { id: 'brakes', name: 'Brakes', icon: 'brake', description: 'Stronger stopping and a quicker reverse.', maxLevel: MAX_UPGRADE_LEVEL, perLevelLabel: '+15% STOPPING POWER' },
];

export type UpgradeLevels = Record<UpgradeId, number>;

export const defaultUpgradeLevels = (): UpgradeLevels => ({
  engine: 1, tires: 1, suspension: 1, fuel: 1, air: 1, brakes: 1,
});

/** Coin cost to go from `level` to `level + 1`. */
export const upgradeCost = (vehicle: VehicleDef, upgrade: UpgradeId, level: number): number => {
  const statMul: Record<UpgradeId, number> = { engine: 1.15, tires: 1.0, suspension: 1.0, fuel: 0.9, air: 0.85, brakes: 0.75 };
  const raw = vehicle.upgradeCostBase * statMul[upgrade] * Math.pow(1.42, level - 1);
  return Math.max(10, Math.round(raw / 10) * 10);
};

/**
 * Applies upgrade levels to a vehicle's base physics, producing the tuning the
 * simulation uses. Each level is noticeable, and maxed vehicles stay sane.
 */
export const applyUpgrades = (base: VehiclePhysicsDef, levels: UpgradeLevels): VehiclePhysicsDef => {
  const l = (id: UpgradeId) => Math.max(0, Math.min(MAX_UPGRADE_LEVEL, levels[id] ?? 1) - 1);
  const p: VehiclePhysicsDef = { ...base };
  p.motorTorque = base.motorTorque * (1 + 0.09 * l('engine'));
  p.topSpeed = base.topSpeed * (1 + 0.035 * l('engine'));
  p.wheelFriction = base.wheelFriction * (1 + 0.06 * l('tires'));
  p.suspensionDamping = Math.min(0.95, base.suspensionDamping * (1 + 0.04 * l('suspension')));
  p.suspensionTravel = base.suspensionTravel * (1 + 0.035 * l('suspension'));
  p.impactTolerance = base.impactTolerance * (1 + 0.08 * l('suspension'));
  p.fuelCapacity = base.fuelCapacity * (1 + 0.12 * l('fuel'));
  p.airSpin = base.airSpin * (1 + 0.08 * l('air'));
  p.airResponse = base.airResponse * (1 + 0.08 * l('air'));
  p.brakeTorque = base.brakeTorque * (1 + 0.15 * l('brakes'));
  p.reverseSpeed = base.reverseSpeed * (1 + 0.04 * l('brakes'));
  return p;
};

/** Normalized 0..1 display stats used for the garage bars. */
export interface DisplayStats {
  speed: number;
  acceleration: number;
  grip: number;
  suspension: number;
  air: number;
  fuel: number;
}

export const displayStats = (p: VehiclePhysicsDef): DisplayStats => {
  const n = (v: number, lo: number, hi: number) => Math.max(0.04, Math.min(1, (v - lo) / (hi - lo)));
  const mass = estimateMass(p);
  return {
    speed: n(p.topSpeed, 8, 34),
    acceleration: n(p.motorTorque / mass, 1.0, 7.0),
    grip: n(p.wheelFriction * (1 + p.downforce * 40), 0.7, 2.0),
    suspension: n(p.impactTolerance + p.suspensionTravel * 12, 10, 34),
    air: n(p.airSpin * Math.sqrt(p.airResponse), 3, 13),
    fuel: n(p.fuelCapacity, 18, 100),
  };
};

const polyArea = (pts: { x: number; y: number }[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
};

export const estimateMass = (p: VehiclePhysicsDef): number => {
  let m = 0;
  for (const part of p.bodyParts) m += polyArea(part) * p.bodyDensity;
  m += Math.PI * p.rearWheel.radius ** 2 * p.wheelDensity;
  m += Math.PI * p.frontWheel.radius ** 2 * p.wheelDensity;
  return m;
};
