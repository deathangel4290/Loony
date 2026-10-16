import { COSMETIC_BY_ID, DEFAULT_LOADOUT } from '../data/cosmetics';
import type { CosmeticSlot, VehicleDef } from '../data/types';
import { defaultUpgradeLevels } from '../data/upgrades';
import { getVehicle, VEHICLES } from '../data/vehicles';
import type { EventBus } from '../core/EventBus';
import type { CurrencyManager } from './CurrencyManager';
import type { GameEvents } from './events';
import type { SaveManager } from './SaveManager';

export type PurchaseResult = 'ok' | 'owned' | 'level' | 'funds' | 'unavailable';

/** Vehicle ownership, selection and cosmetic loadouts. */
export class GarageManager {
  constructor(private save: SaveManager, private currency: CurrencyManager, private events: EventBus<GameEvents>) {}

  get selected(): VehicleDef {
    return getVehicle(this.save.data.selectedVehicle);
  }

  owns(vehicleId: string): boolean {
    return this.save.data.ownedVehicles.includes(vehicleId);
  }

  select(vehicleId: string): boolean {
    if (!this.owns(vehicleId)) return false;
    this.save.data.selectedVehicle = vehicleId;
    this.save.markDirty();
    this.events.emit('profile', undefined);
    return true;
  }

  canBuy(v: VehicleDef): PurchaseResult {
    if (this.owns(v.id)) return 'owned';
    if (this.save.data.level < v.requiredLevel) return 'level';
    if (!this.currency.canAfford(v.price)) return 'funds';
    return 'ok';
  }

  buy(vehicleId: string): PurchaseResult {
    const v = getVehicle(vehicleId);
    const status = this.canBuy(v);
    if (status !== 'ok') return status;
    this.currency.spend(v.price);
    this.grantVehicle(v.id);
    return 'ok';
  }

  grantVehicle(vehicleId: string): void {
    const d = this.save.data;
    if (!d.ownedVehicles.includes(vehicleId)) d.ownedVehicles.push(vehicleId);
    d.upgrades[vehicleId] ??= defaultUpgradeLevels();
    d.loadouts[vehicleId] ??= { ...DEFAULT_LOADOUT };
    d.stats.vehiclesOwned = d.ownedVehicles.length;
    this.save.markDirty();
    this.events.emit('profile', undefined);
  }

  /** Next vehicle the player is working towards (for progress hints). */
  nextLocked(): VehicleDef | null {
    return VEHICLES.find((v) => !this.owns(v.id)) ?? null;
  }

  // ---- cosmetics -----------------------------------------------------------

  ownsCosmetic(id: string): boolean {
    return this.save.data.ownedCosmetics.includes(id);
  }

  buyCosmetic(id: string): PurchaseResult {
    const c = COSMETIC_BY_ID[id];
    if (!c || c.rewardOnly) return 'unavailable';
    if (this.ownsCosmetic(id)) return 'owned';
    if (!this.currency.spend(c.price, c.currency)) return 'funds';
    this.grantCosmetic(id);
    return 'ok';
  }

  /** Returns false if it was already owned. */
  grantCosmetic(id: string): boolean {
    if (!COSMETIC_BY_ID[id] || this.ownsCosmetic(id)) return false;
    this.save.data.ownedCosmetics.push(id);
    this.save.markDirty();
    this.events.emit('profile', undefined);
    return true;
  }

  loadout(vehicleId: string): Record<CosmeticSlot, string> {
    return (this.save.data.loadouts[vehicleId] ??= { ...DEFAULT_LOADOUT });
  }

  equip(vehicleId: string, cosmeticId: string): boolean {
    const c = COSMETIC_BY_ID[cosmeticId];
    if (!c || !this.ownsCosmetic(cosmeticId) || !this.owns(vehicleId)) return false;
    this.loadout(vehicleId)[c.slot] = cosmeticId;
    this.save.markDirty();
    this.events.emit('profile', undefined);
    return true;
  }
}
