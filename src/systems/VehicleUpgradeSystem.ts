import { applyUpgrades, defaultUpgradeLevels, MAX_UPGRADE_LEVEL, upgradeCost, type UpgradeLevels } from '../data/upgrades';
import type { UpgradeId, VehiclePhysicsDef } from '../data/types';
import { getVehicle } from '../data/vehicles';
import type { CurrencyManager } from './CurrencyManager';
import type { SaveManager } from './SaveManager';

export type UpgradeResult = 'ok' | 'max' | 'funds' | 'locked';

export class VehicleUpgradeSystem {
  constructor(private save: SaveManager, private currency: CurrencyManager) {}

  levels(vehicleId: string): UpgradeLevels {
    return (this.save.data.upgrades[vehicleId] ??= defaultUpgradeLevels());
  }

  level(vehicleId: string, id: UpgradeId): number {
    return this.levels(vehicleId)[id];
  }

  cost(vehicleId: string, id: UpgradeId): number {
    return upgradeCost(getVehicle(vehicleId), id, this.level(vehicleId, id));
  }

  isMaxed(vehicleId: string, id: UpgradeId): boolean {
    return this.level(vehicleId, id) >= MAX_UPGRADE_LEVEL;
  }

  upgrade(vehicleId: string, id: UpgradeId, useToken = false): UpgradeResult {
    if (!this.save.data.ownedVehicles.includes(vehicleId)) return 'locked';
    if (this.isMaxed(vehicleId, id)) return 'max';
    const paid = useToken ? this.currency.spend(1, 'tokens') : this.currency.spend(this.cost(vehicleId, id), 'coins');
    if (!paid) return 'funds';
    this.levels(vehicleId)[id] += 1;
    this.save.data.stats.upgradesBought += 1;
    this.save.markDirty();
    return 'ok';
  }

  /** Effective physics for a vehicle with its current upgrades applied. */
  tuning(vehicleId: string, overrideLevels?: UpgradeLevels): VehiclePhysicsDef {
    return applyUpgrades(getVehicle(vehicleId).physics, overrideLevels ?? this.levels(vehicleId));
  }
}
