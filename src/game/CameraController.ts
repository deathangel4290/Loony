import { CONFIG } from '../data/config';
import { clamp, damp } from '../core/math';

export interface CameraTarget {
  x: number;
  y: number;
  vx: number;
  vy: number;
  airborne: boolean;
  /** Height of the car above the ground below it. */
  heightAboveGround: number;
  speedFrac: number;
}

/**
 * Smooth follow camera with velocity look-ahead, speed/air zoom and a
 * trauma-based shake (shake = trauma^2, so small hits stay subtle).
 */
export class CameraController {
  x = 0;
  y = 0;
  /** Visible world height in meters. */
  viewH: number = CONFIG.camera.baseViewHeight;
  /** Screen aspect (w/h); used to keep a minimum visible width. */
  aspect = 16 / 9;
  private lookX = 0;
  private lookY = 0;
  private trauma = 0;
  shakeScale = 1;
  shakeX = 0;
  shakeY = 0;
  shakeRot = 0;
  private time = 0;
  /** Extra zoom punch (meters of view height), decays quickly. */
  private punch = 0;

  snap(t: CameraTarget): void {
    this.x = t.x + 3;
    this.y = t.y + 1.2;
    this.lookX = 3;
    this.lookY = 0;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.shakeScale);
  }

  zoomPunch(amount: number): void {
    this.punch = Math.max(this.punch, amount);
  }

  update(dt: number, t: CameraTarget): void {
    const cfg = CONFIG.camera;
    this.time += dt;
    const targetLookX = clamp(t.vx * cfg.lookAhead, -4, 9);
    const targetLookY = clamp(t.vy * 0.12, -2.5, 2.5);
    this.lookX = damp(this.lookX, targetLookX, 1.6, dt);
    this.lookY = damp(this.lookY, targetLookY, 2.0, dt);

    let wantH = cfg.baseViewHeight + t.speedFrac * 2.4;
    // In the air, frame both the car and the ground it will land on.
    if (t.airborne) wantH = Math.max(wantH, (t.heightAboveGround + 3.5) * 1.3);
    wantH = clamp(wantH, cfg.baseViewHeight, cfg.maxViewHeight);
    // Keep at least ~20m of road visible on squarer screens (iPad).
    wantH = Math.max(wantH, 21 / this.aspect);
    this.viewH = damp(this.viewH, wantH + this.punch, cfg.zoomRate, dt);
    this.punch = damp(this.punch, 0, 5, dt);

    const tx = t.x + this.lookX;
    const ty = t.y + 1.0 + this.lookY + (t.airborne ? -t.heightAboveGround * 0.42 : 0);
    this.x = damp(this.x, tx, cfg.followRate, dt);
    this.y = damp(this.y, ty, cfg.followRate * 0.8, dt);

    // Never let the car leave the frame vertically.
    const halfH = this.viewH / 2;
    this.y = clamp(this.y, t.y - halfH * 0.55, t.y + halfH * 0.7);

    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    const n = (k: number) => Math.sin(this.time * 37 + k) * 0.5 + Math.sin(this.time * 61 + k * 2.3) * 0.5;
    this.shakeX = s * 0.45 * n(1);
    this.shakeY = s * 0.45 * n(7);
    this.shakeRot = s * 0.035 * n(13);
  }
}
