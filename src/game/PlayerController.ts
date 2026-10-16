import { CONFIG } from '../data/config';
import type { VehicleDef, VehiclePhysicsDef } from '../data/types';
import { wrapAngle } from '../core/math';
import type { EndReason } from '../systems/RunSummary';
import type { TerrainGenerator } from './TerrainGenerator';
import { VehiclePhysics, type DriveInput } from './VehiclePhysics';
import type { World } from 'planck';

/**
 * Run-level state of the player's vehicle: fuel, damage, distance and the
 * rules that end a run. Physics lives in VehiclePhysics.
 */
export class PlayerController {
  readonly vehicle: VehiclePhysics;
  fuel: number;
  readonly fuelMax: number;
  health = 1;
  endReason: EndReason | null = null;
  maxX = 0;
  readonly startY: number;
  maxAltitude = 0;
  /** Set when an impact happened this step (for FX). */
  lastImpact = 0;
  godMode = false;
  private noFuelTimer = 0;
  private noFuelStill = 0;
  private flippedTimer = 0;
  lowFuelWarned = false;

  constructor(world: World, readonly def: VehicleDef, readonly tuning: VehiclePhysicsDef, private gen: TerrainGenerator, spawnX: number) {
    const groundY = gen.surfaceAt(spawnX);
    const clearance = Math.max(-tuning.rearWheel.y + tuning.rearWheel.radius, -tuning.frontWheel.y + tuning.frontWheel.radius);
    this.vehicle = new VehiclePhysics(world, def, tuning, spawnX, groundY + clearance + 0.05);
    this.fuelMax = tuning.fuelCapacity;
    this.fuel = this.fuelMax;
    this.startY = groundY;
  }

  get x(): number {
    return this.vehicle.chassis.getPosition().x;
  }

  get distance(): number {
    return Math.max(0, this.maxX);
  }

  get fuelFrac(): number {
    return this.fuel / this.fuelMax;
  }

  get alive(): boolean {
    return this.endReason === null;
  }

  beforeStep(dt: number, input: DriveInput): void {
    const v = this.vehicle;
    v.beginStep();
    if (!this.alive) {
      v.applyControls(dt, { gas: false, brake: false }, false);
      return;
    }
    v.applyControls(dt, input, this.fuel > 0);
    // Fuel burns faster on the throttle, slowly at idle.
    const rate = input.gas || input.brake ? 1 : CONFIG.vehicle.fuelIdleFactor;
    if (!this.godMode) this.fuel = Math.max(0, this.fuel - rate * dt);
  }

  afterStep(dt: number): void {
    const v = this.vehicle;
    v.readContacts(dt);
    const pos = v.chassis.getPosition();
    if (pos.x > this.maxX) this.maxX = pos.x;
    this.maxAltitude = Math.max(this.maxAltitude, pos.y - this.startY);
    this.lastImpact = v.impact;
    if (!this.alive || this.godMode) return;

    if (v.lavaHit) return this.end('lava');
    if (v.headHit) return this.end('crash');

    if (v.impact > this.tuning.impactTolerance) {
      this.health -= (v.impact - this.tuning.impactTolerance) * 0.055;
      if (this.health <= 0) {
        this.health = 0;
        return this.end('damage');
      }
    }

    const pitch = Math.abs(wrapAngle(v.chassis.getAngle()));
    const speed = v.speed;
    if (pitch > 1.85 && speed < 1.2 && (v.bodyGrounded || v.grounded)) {
      this.flippedTimer += dt;
      if (this.flippedTimer > CONFIG.vehicle.flippedTime) return this.end('flipped');
    } else this.flippedTimer = 0;

    if (this.fuel <= 0) {
      this.noFuelTimer += dt;
      this.noFuelStill = speed < 0.45 ? this.noFuelStill + dt : 0;
      if (this.noFuelStill > CONFIG.vehicle.outOfFuelStopTime || this.noFuelTimer > CONFIG.vehicle.outOfFuelMaxTime) return this.end('fuel');
    } else {
      this.noFuelTimer = 0;
      this.noFuelStill = 0;
    }

    if (pos.y < this.gen.heightAt(pos.x) - 25) return this.end('crash');
  }

  refuel(): void {
    this.fuel = this.fuelMax;
    this.lowFuelWarned = false;
  }

  end(reason: EndReason): void {
    if (this.endReason) return;
    this.endReason = reason;
  }

  destroy(): void {
    this.vehicle.destroy();
  }
}
