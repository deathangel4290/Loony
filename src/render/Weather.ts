import type { WorldParticle } from '../data/types';

/**
 * Screen-space ambient particles (pollen, dust, snow, paper, embers) with a
 * parallax response to camera motion. Fixed-size, allocation free.
 */
export class Weather {
  private x: Float32Array;
  private y: Float32Array;
  private z: Float32Array;
  private phase: Float32Array;
  private n: number;
  private lastCamX = 0;
  private lastCamY = 0;
  private first = true;

  constructor(public kind: WorldParticle | 'none', count: number) {
    this.n = count;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.z = new Float32Array(count);
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.x[i] = Math.random();
      this.y[i] = Math.random();
      this.z[i] = 0.3 + Math.random() * 0.7;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
  }

  setKind(kind: WorldParticle | 'none'): void {
    this.kind = kind;
  }

  /** camX/camY in meters, viewW/viewH in meters. */
  update(dt: number, camX: number, camY: number, viewW: number, viewH: number, time: number): void {
    if (this.first) {
      this.lastCamX = camX;
      this.lastCamY = camY;
      this.first = false;
    }
    const dcx = (camX - this.lastCamX) / viewW;
    const dcy = (camY - this.lastCamY) / viewH;
    this.lastCamX = camX;
    this.lastCamY = camY;
    let vx = 0;
    let vy = 0;
    switch (this.kind) {
      case 'snow': vx = -0.02; vy = 0.08; break;
      case 'embers': vx = 0.01; vy = -0.06; break;
      case 'dust': vx = -0.06; vy = 0.005; break;
      case 'paper': vx = -0.05; vy = 0.025; break;
      case 'pollen': vx = -0.015; vy = -0.008; break;
    }
    for (let i = 0; i < this.n; i++) {
      const z = this.z[i];
      this.x[i] -= dcx * z * 1.4 - vx * dt * z + Math.sin(time * 1.3 + this.phase[i]) * 0.0006;
      this.y[i] += dcy * z * 1.4 + vy * dt * z;
      if (this.x[i] < -0.05) this.x[i] += 1.1;
      else if (this.x[i] > 1.05) this.x[i] -= 1.1;
      if (this.y[i] < -0.05) this.y[i] += 1.1;
      else if (this.y[i] > 1.05) this.y[i] -= 1.1;
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
    if (this.kind === 'none') return;
    const unit = h / 400;
    let color = '#ffffff';
    switch (this.kind) {
      case 'pollen': color = '#fff8c4'; break;
      case 'dust': color = '#ffe0b0'; break;
      case 'snow': color = '#ffffff'; break;
      case 'paper': color = '#e8ecff'; break;
      case 'embers': color = '#ffb347'; break;
    }
    ctx.fillStyle = color;
    for (let i = 0; i < this.n; i++) {
      const z = this.z[i];
      const x = this.x[i] * w;
      const y = this.y[i] * h;
      const s = unit * z * (this.kind === 'snow' ? 2.4 : this.kind === 'paper' ? 3 : 1.6);
      ctx.globalAlpha = (this.kind === 'embers' ? 0.5 + 0.5 * Math.sin(time * 6 + this.phase[i]) : 0.75) * z;
      if (this.kind === 'paper') {
        const r = Math.sin(time * 2 + this.phase[i]);
        ctx.fillRect(x, y, s * r, s * 0.7);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
