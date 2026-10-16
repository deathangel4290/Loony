import { CONFIG } from '../data/config';
import { TAU, wrapAngle } from '../core/math';
import type { VehiclePhysics } from './VehiclePhysics';

export type TrickKind = 'backflip' | 'frontflip' | 'bigair' | 'hugeair' | 'longjump' | 'perfect' | 'closecall' | 'wheelie' | 'multi';

export interface TrickAward {
  kind: TrickKind;
  label: string;
  points: number;
  /** Rotations for flips. */
  count?: number;
}

export interface TrickEvent {
  awards: TrickAward[];
  multiplier: number;
  total: number;
  combo: number;
}

const FLIP_NAMES = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD ', 'INSANE '];

/**
 * Watches the vehicle and turns airtime, rotation and balance into tricks.
 * Awards are held for a short confirmation window after landing so a trick
 * that ends in a crash doesn't pay out.
 */
export class TrickSystem {
  // run totals
  flips = 0;
  backflips = 0;
  frontflips = 0;
  perfectLandings = 0;
  tricks = 0;
  points = 0;
  longestWheelie = 0;
  longestAirtime = 0;
  bestCombo = 0;

  // combo
  combo = 0;
  comboTimer = 0;

  // live state for HUD
  wheelieTime = 0;
  airTime = 0;
  /** Completed rotations in the current jump (live). */
  liveFlips = 0;

  private inAir = false;
  private takeoffAngle = 0;
  private takeoffX = 0;
  private pending: TrickAward[] | null = null;
  private landingTime = 0;
  private firstTouch = 0;
  private bothTouched = false;
  private landErr = 0;
  private landAirTime = 0;
  private landedRot = 0;

  constructor(private onTrick: (e: TrickEvent) => void, private onComboEnd: (combo: number) => void, private onBail: () => void) {}

  get multiplier(): number {
    return Math.max(1, Math.min(CONFIG.tricks.maxCombo, this.combo));
  }

  step(dt: number, v: VehiclePhysics, alive: boolean): void {
    const cfg = CONFIG.tricks;
    const angle = v.chassis.getAngle();

    if (!alive) {
      if (this.pending) {
        this.pending = null;
        this.onBail();
      }
      this.combo = 0;
      this.comboTimer = 0;
      return;
    }

    const air = v.airborne;
    if (air && !this.inAir) {
      this.inAir = true;
      this.takeoffAngle = angle;
      this.takeoffX = v.chassis.getPosition().x;
      this.airTime = 0;
      this.endWheelie();
    }
    if (this.inAir) {
      this.airTime += dt;
      const rot = angle - this.takeoffAngle;
      this.liveFlips = Math.floor((Math.abs(rot) + 0.15) / TAU);
      if (!air) this.land(v, angle);
    }

    // Landing evaluation window (perfect landing needs both wheels down).
    if (this.pending) {
      this.landingTime += dt;
      if (!this.bothTouched && v.rearGrounded && v.frontGrounded) {
        this.bothTouched = true;
        this.firstTouch = this.landingTime;
      }
      if (this.landingTime >= 0.3) this.confirm(v);
    }

    // Wheelies
    const pitch = wrapAngle(angle);
    const wheelie = !this.inAir && v.rearGrounded && !v.frontGrounded && !v.bodyGrounded && pitch > 0.12 && v.forwardSpeed > 2;
    if (wheelie) this.wheelieTime += dt;
    else if (this.wheelieTime > 0 && (v.frontGrounded || v.bodyGrounded || this.inAir || v.forwardSpeed <= 2)) this.endWheelie();

    // Combo timer runs only while grounded.
    if (this.combo > 0 && !this.inAir && !this.pending && this.wheelieTime < cfg.wheelieMinTime) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.onComboEnd(this.combo);
        this.combo = 0;
      }
    }
  }

  private land(v: VehiclePhysics, angle: number): void {
    const cfg = CONFIG.tricks;
    this.inAir = false;
    const air = this.airTime;
    this.liveFlips = 0;
    this.longestAirtime = Math.max(this.longestAirtime, air);
    if (air < cfg.minAirTime) return;
    const n = v.groundNormal;
    const surface = Math.atan2(-n.x, n.y);
    this.landErr = Math.abs(wrapAngle(angle - surface));
    this.landAirTime = air;
    this.landedRot = angle - this.takeoffAngle;
    const awards: TrickAward[] = [];
    const rot = this.landedRot;
    const flips = Math.floor((Math.abs(rot) + cfg.flipTolerance) / TAU);
    if (flips > 0) {
      const movingRight = v.chassis.getLinearVelocity().x >= 0;
      const back = rot > 0 === movingRight;
      let pts = 0;
      for (let i = 0; i < flips; i++) pts += cfg.flipPoints[Math.min(i, cfg.flipPoints.length - 1)];
      const name = `${FLIP_NAMES[Math.min(flips, 5)]}${back ? 'BACKFLIP' : 'FRONTFLIP'}`;
      awards.push({ kind: back ? 'backflip' : 'frontflip', label: name, points: pts, count: flips });
    }
    if (air >= cfg.hugeAirTime) awards.push({ kind: 'hugeair', label: 'HUGE AIR', points: Math.round(150 * air) });
    else if (air >= cfg.bigAirTime) awards.push({ kind: 'bigair', label: 'BIG AIR', points: Math.round(80 * air) });
    const dist = Math.abs(v.chassis.getPosition().x - this.takeoffX);
    if (dist >= cfg.longJumpDistance) awards.push({ kind: 'longjump', label: `LONG JUMP ${Math.round(dist)}m`, points: Math.round(dist * 6) });
    this.pending = awards;
    this.landingTime = 0;
    this.bothTouched = v.rearGrounded && v.frontGrounded;
    this.firstTouch = 0;
  }

  private confirm(v: VehiclePhysics): void {
    const cfg = CONFIG.tricks;
    const awards = this.pending!;
    this.pending = null;
    if (this.bothTouched && this.firstTouch <= cfg.perfectWheelWindow && this.landErr < cfg.perfectAngle && this.landAirTime > 0.6 && !v.bodyGrounded) {
      awards.push({ kind: 'perfect', label: 'PERFECT LANDING + BOOST', points: 500 });
      this.perfectLandings++;
    } else if (this.landErr > cfg.closeCallAngle) {
      awards.push({ kind: 'closecall', label: 'CLOSE CALL!', points: 150 });
    }
    if (!awards.length) return;
    for (const a of awards) {
      if (a.kind === 'backflip') {
        this.backflips += a.count ?? 1;
        this.flips += a.count ?? 1;
      } else if (a.kind === 'frontflip') {
        this.frontflips += a.count ?? 1;
        this.flips += a.count ?? 1;
      }
    }
    this.combo += awards.length >= 3 ? 2 : 1;
    if (awards.length >= 2) awards.push({ kind: 'multi', label: 'MULTI-TRICK', points: 0 });
    this.award(awards);
  }

  private endWheelie(): void {
    const t = this.wheelieTime;
    this.wheelieTime = 0;
    this.longestWheelie = Math.max(this.longestWheelie, t);
    if (t >= CONFIG.tricks.wheelieMinTime) {
      this.combo += 1;
      this.award([{ kind: 'wheelie', label: `WHEELIE ${t.toFixed(1)}s`, points: Math.round(t * CONFIG.tricks.wheeliePointsPerSec) }]);
    }
  }

  private award(awards: TrickAward[]): void {
    const mult = this.multiplier;
    let total = 0;
    for (const a of awards) total += a.points;
    total *= mult;
    this.points += total;
    this.tricks += awards.filter((a) => a.kind !== 'multi').length;
    this.comboTimer = CONFIG.tricks.comboWindow;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.onTrick({ awards, multiplier: mult, total, combo: this.combo });
  }

  /** Called when the run ends to bank an in-progress wheelie. */
  finish(): void {
    if (this.wheelieTime > 0) this.longestWheelie = Math.max(this.longestWheelie, this.wheelieTime);
  }
}
