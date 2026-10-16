import type { VehicleStyle } from '../data/types';
import { shade, rgba } from './color';

/**
 * Procedural vehicle artwork. All coordinates are local meters, y-up, matching
 * the physics shapes so the silhouette and the collision agree. Each style has
 * a distinct, readable silhouette.
 */

export interface VehicleAnchors {
  /** Roof mounting point for accessories. */
  roof: [number, number];
  /** Rear deck (spoiler mount). */
  rear: [number, number];
  exhaust: [number, number];
  headlight: [number, number];
  /** Driver torso base and head center. */
  driver: [number, number];
  /** Body bounds for sprite allocation. */
  bounds: [number, number, number, number];
  /** Where suspension struts meet the body (relative to wheel rest x). */
  strutTop: number;
  open: boolean;
}

export const ANCHORS: Record<VehicleStyle, VehicleAnchors> = {
  hatch: { roof: [-0.4, 0.88], rear: [-1.1, 0.86], exhaust: [-1.36, -0.12], headlight: [1.38, 0.1], driver: [-0.36, 0.62], bounds: [-1.5, -0.35, 1.55, 1.05], strutTop: 0.15, open: false },
  buggy: { roof: [-0.35, 0.98], rear: [-1.05, 0.5], exhaust: [-1.3, 0.05], headlight: [1.32, 0.18], driver: [-0.28, 0.62], bounds: [-1.45, -0.3, 1.5, 1.1], strutTop: 0.3, open: true },
  muscle: { roof: [-0.3, 0.72], rear: [-1.5, 0.36], exhaust: [-1.68, -0.1], headlight: [1.68, 0.1], driver: [-0.32, 0.52], bounds: [-1.8, -0.3, 1.85, 0.95], strutTop: 0.12, open: false },
  rally: { roof: [-0.4, 0.84], rear: [-1.25, 0.82], exhaust: [-1.45, -0.12], headlight: [1.46, 0.12], driver: [-0.36, 0.6], bounds: [-1.6, -0.35, 1.65, 1.05], strutTop: 0.15, open: false },
  monster: { roof: [-0.35, 1.14], rear: [-1.4, 0.68], exhaust: [-0.95, 1.0], headlight: [1.58, 0.42], driver: [-0.36, 0.9], bounds: [-1.65, -0.35, 1.75, 1.45], strutTop: 0.45, open: false },
  super: { roof: [-0.42, 0.62], rear: [-1.42, 0.62], exhaust: [-1.66, 0.02], headlight: [1.74, 0.04], driver: [-0.42, 0.42], bounds: [-1.8, -0.3, 1.95, 0.95], strutTop: 0.1, open: false },
  future: { roof: [-0.4, 0.8], rear: [-1.35, 0.5], exhaust: [-1.52, 0.02], headlight: [1.66, 0.08], driver: [-0.4, 0.56], bounds: [-1.65, -0.3, 1.82, 1.0], strutTop: 0.12, open: false },
};

type Ctx = CanvasRenderingContext2D;

const OUTLINE = '#1c1b2e';
const GLASS = '#9fe3ff';

const poly = (ctx: Ctx, pts: number[]) => {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
};

const bodyFill = (ctx: Ctx, paint: string, y0: number, y1: number) => {
  const g = ctx.createLinearGradient(0, y1, 0, y0);
  g.addColorStop(0, shade(paint, 0.28));
  g.addColorStop(0.45, paint);
  g.addColorStop(1, shade(paint, -0.32));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.05;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
};

const glass = (ctx: Ctx, pts: number[]) => {
  poly(ctx, pts);
  ctx.fillStyle = rgba(GLASS, 0.42);
  ctx.fill();
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // glare
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(pts[0] - 0.2, pts[1] - 0.1);
  ctx.lineTo(pts[0] + 0.25, pts[1] + 0.5);
  ctx.stroke();
  ctx.restore();
};

const light = (ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
};

const bumper = (ctx: Ctx, x: number, y: number, w: number, h: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = '#3a3a4a';
  ctx.fill();
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
};

const arch = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = '#23222f';
  ctx.fill();
};

const highlight = (ctx: Ctx, pts: number[]) => {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  ctx.stroke();
};

/** Interior (drawn behind the driver). */
export const drawInterior = (ctx: Ctx, style: VehicleStyle): void => {
  ctx.fillStyle = '#2a2838';
  switch (style) {
    case 'hatch': poly(ctx, [0.45, 0.34, 0.14, 0.82, -0.9, 0.84, -1.1, 0.36]); break;
    case 'rally': poly(ctx, [0.46, 0.36, 0.1, 0.78, -0.88, 0.8, -1.06, 0.38]); break;
    case 'muscle': poly(ctx, [0.44, 0.3, 0.1, 0.66, -0.7, 0.68, -1.0, 0.34]); break;
    case 'monster': poly(ctx, [0.42, 0.66, 0.14, 1.08, -0.82, 1.08, -0.9, 0.68]); break;
    case 'super': poly(ctx, [0.6, 0.3, -0.05, 0.58, -0.78, 0.56, -0.95, 0.3]); break;
    case 'future': poly(ctx, [0.9, 0.42, 0.2, 0.74, -0.8, 0.74, -1.0, 0.38]); break;
    case 'buggy':
      // seat
      ctx.beginPath();
      ctx.roundRect(-0.72, 0.2, 0.28, 0.5, 0.08);
      ctx.fillStyle = '#2a2838';
      ctx.fill();
      return;
  }
  ctx.fill();
};

/** Main body. `layer` 'body' draws paint + glass + details. */
export const drawBody = (ctx: Ctx, style: VehicleStyle, paint: string, decal: string): void => {
  switch (style) {
    case 'hatch': {
      const outline = [-1.32, -0.18, 1.3, -0.22, 1.42, 0.06, 1.38, 0.2, 1.12, 0.34, 0.52, 0.38, 0.16, 0.88, -0.94, 0.9, -1.18, 0.42, -1.34, 0.12];
      poly(ctx, outline);
      bodyFill(ctx, paint, -0.22, 0.9);
      drawDecal(ctx, decal, style);
      glass(ctx, [0.42, 0.42, 0.12, 0.8, -0.36, 0.8, -0.36, 0.42]);
      glass(ctx, [-0.44, 0.42, -0.44, 0.8, -0.88, 0.8, -1.06, 0.44]);
      arch(ctx, -0.86, -0.22, 0.5);
      arch(ctx, 0.92, -0.22, 0.5);
      bumper(ctx, 1.08, -0.24, 0.38, 0.14);
      bumper(ctx, -1.38, -0.22, 0.34, 0.14);
      light(ctx, 1.34, 0.12, 0.07, 0.06, '#fff6c8');
      light(ctx, -1.29, 0.24, 0.05, 0.08, '#ff4b4b');
      ctx.beginPath();
      ctx.moveTo(-0.4, 0.36);
      ctx.lineTo(-0.4, -0.12);
      ctx.strokeStyle = rgba(OUTLINE, 0.5);
      ctx.lineWidth = 0.025;
      ctx.stroke();
      highlight(ctx, [1.05, 0.34, 0.55, 0.38]);
      highlight(ctx, [0.05, 0.86, -0.8, 0.88]);
      break;
    }
    case 'rally': {
      const outline = [-1.38, -0.16, 1.4, -0.2, 1.52, 0.08, 1.46, 0.22, 1.2, 0.36, 0.52, 0.38, 0.12, 0.84, -0.92, 0.86, -1.22, 0.46, -1.42, 0.3];
      poly(ctx, outline);
      bodyFill(ctx, paint, -0.2, 0.86);
      // livery band
      ctx.save();
      poly(ctx, outline);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      poly(ctx, [-1.5, 0.1, 1.6, 0.0, 1.6, 0.12, -1.5, 0.22]);
      ctx.fill();
      ctx.restore();
      drawDecal(ctx, decal, style);
      glass(ctx, [0.42, 0.42, 0.08, 0.78, -0.36, 0.78, -0.36, 0.42]);
      glass(ctx, [-0.44, 0.42, -0.44, 0.78, -0.86, 0.78, -1.1, 0.46]);
      arch(ctx, -0.95, -0.2, 0.52);
      arch(ctx, 0.98, -0.2, 0.52);
      // roof scoop
      poly(ctx, [-0.2, 0.84, -0.55, 0.84, -0.5, 0.94, -0.25, 0.94]);
      ctx.fillStyle = '#2b2b38';
      ctx.fill();
      // light pod
      light(ctx, 1.42, 0.13, 0.08, 0.07, '#fff6c8');
      light(ctx, 1.22, -0.02, 0.07, 0.07, '#fff6c8');
      light(ctx, -1.36, 0.36, 0.05, 0.07, '#ff4b4b');
      bumper(ctx, 1.12, -0.24, 0.42, 0.14);
      bumper(ctx, -1.44, -0.22, 0.36, 0.14);
      // mud flaps
      ctx.fillStyle = '#26252f';
      ctx.fillRect(-1.5, -0.42, 0.06, 0.26);
      ctx.fillRect(0.36, -0.42, 0.06, 0.26);
      highlight(ctx, [1.1, 0.36, 0.55, 0.38]);
      break;
    }
    case 'muscle': {
      const outline = [-1.62, -0.16, 1.6, -0.18, 1.72, 0.06, 1.62, 0.26, 0.48, 0.3, 0.12, 0.7, -0.72, 0.72, -1.46, 0.36, -1.66, 0.3, -1.68, 0.0];
      poly(ctx, outline);
      bodyFill(ctx, paint, -0.18, 0.72);
      drawDecal(ctx, decal, style);
      glass(ctx, [0.4, 0.34, 0.1, 0.64, -0.3, 0.64, -0.3, 0.34]);
      glass(ctx, [-0.38, 0.34, -0.38, 0.64, -0.68, 0.66, -0.98, 0.38]);
      arch(ctx, -1.06, -0.18, 0.54);
      arch(ctx, 1.12, -0.18, 0.5);
      // hood scoop
      poly(ctx, [0.75, 0.29, 1.2, 0.27, 1.12, 0.37, 0.82, 0.38]);
      ctx.fillStyle = shade(paint, -0.45);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.03;
      ctx.stroke();
      // ducktail
      poly(ctx, [-1.46, 0.36, -1.7, 0.42, -1.66, 0.3]);
      ctx.fillStyle = shade(paint, -0.2);
      ctx.fill();
      bumper(ctx, 1.3, -0.22, 0.46, 0.14);
      bumper(ctx, -1.76, -0.2, 0.42, 0.14);
      light(ctx, 1.66, 0.12, 0.06, 0.07, '#fff6c8');
      light(ctx, -1.62, 0.2, 0.05, 0.08, '#ff3030');
      highlight(ctx, [1.5, 0.26, 0.6, 0.3]);
      highlight(ctx, [0.0, 0.69, -0.6, 0.71]);
      break;
    }
    case 'super': {
      const outline = [-1.62, -0.12, 1.7, -0.14, 1.86, -0.02, 1.7, 0.08, 0.9, 0.26, 0.62, 0.3, -0.05, 0.62, -0.8, 0.6, -1.5, 0.32, -1.66, 0.1];
      poly(ctx, outline);
      bodyFill(ctx, paint, -0.14, 0.62);
      drawDecal(ctx, decal, style);
      glass(ctx, [0.52, 0.31, -0.06, 0.57, -0.7, 0.56, -0.85, 0.32]);
      arch(ctx, -1.08, -0.14, 0.48);
      arch(ctx, 1.16, -0.14, 0.45);
      // side intake
      poly(ctx, [-0.95, 0.14, -0.35, 0.18, -0.35, 0.02, -0.85, -0.02]);
      ctx.fillStyle = '#1f1e29';
      ctx.fill();
      // rear wing
      ctx.fillStyle = '#26252f';
      ctx.fillRect(-1.5, 0.3, 0.06, 0.26);
      ctx.fillRect(-1.25, 0.3, 0.06, 0.24);
      poly(ctx, [-1.72, 0.56, -1.05, 0.58, -1.08, 0.66, -1.7, 0.66]);
      ctx.fillStyle = shade(paint, -0.35);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.03;
      ctx.stroke();
      // splitter
      poly(ctx, [1.3, -0.16, 1.9, -0.12, 1.88, -0.07, 1.3, -0.1]);
      ctx.fillStyle = '#1f1e29';
      ctx.fill();
      light(ctx, 1.66, 0.06, 0.09, 0.035, '#e6fbff');
      light(ctx, -1.62, 0.18, 0.04, 0.06, '#ff2f4f');
      highlight(ctx, [1.6, 0.1, 0.95, 0.25]);
      break;
    }
    case 'future': {
      ctx.beginPath();
      ctx.moveTo(-1.5, -0.14);
      ctx.lineTo(1.5, -0.16);
      ctx.quadraticCurveTo(1.82, -0.1, 1.72, 0.12);
      ctx.quadraticCurveTo(1.4, 0.36, 0.95, 0.42);
      ctx.quadraticCurveTo(0.25, 0.92, -0.85, 0.78);
      ctx.quadraticCurveTo(-1.35, 0.6, -1.48, 0.36);
      ctx.quadraticCurveTo(-1.62, 0.1, -1.5, -0.14);
      ctx.closePath();
      bodyFill(ctx, paint, -0.16, 0.85);
      drawDecal(ctx, decal, style);
      ctx.beginPath();
      ctx.moveTo(0.88, 0.44);
      ctx.quadraticCurveTo(0.2, 0.86, -0.82, 0.74);
      ctx.quadraticCurveTo(-1.02, 0.56, -1.0, 0.4);
      ctx.closePath();
      ctx.fillStyle = rgba('#6ff3ff', 0.38);
      ctx.fill();
      ctx.lineWidth = 0.035;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      // glow strips
      ctx.strokeStyle = '#7dfcff';
      ctx.lineWidth = 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-1.35, 0.08);
      ctx.lineTo(1.45, 0.02);
      ctx.stroke();
      arch(ctx, -1.02, -0.18, 0.54);
      arch(ctx, 1.06, -0.18, 0.54);
      light(ctx, 1.62, 0.06, 0.1, 0.04, '#d8ffff');
      light(ctx, -1.48, 0.2, 0.04, 0.07, '#ff3df2');
      highlight(ctx, [1.3, 0.34, 0.9, 0.44]);
      break;
    }
    case 'monster': {
      // frame
      ctx.fillStyle = '#26252f';
      ctx.fillRect(-1.3, -0.05, 2.6, 0.18);
      const outline = [-1.45, 0.1, 1.5, 0.1, 1.62, 0.4, 1.32, 0.62, 0.45, 0.64, 0.15, 1.12, -0.85, 1.12, -0.95, 0.66, -1.48, 0.66];
      poly(ctx, outline);
      bodyFill(ctx, paint, 0.1, 1.12);
      drawDecal(ctx, decal, style);
      glass(ctx, [0.36, 0.68, 0.1, 1.06, -0.3, 1.06, -0.3, 0.68]);
      glass(ctx, [-0.38, 0.68, -0.38, 1.06, -0.78, 1.06, -0.82, 0.68]);
      // bed rail
      ctx.fillStyle = shade(paint, -0.35);
      ctx.fillRect(-1.48, 0.62, 0.55, 0.08);
      arch(ctx, -1.15, 0.1, 0.36);
      arch(ctx, 1.2, 0.1, 0.36);
      // stacks
      ctx.fillStyle = '#c9ccd6';
      ctx.fillRect(-1.0, 0.66, 0.08, 0.38);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.025;
      ctx.strokeRect(-1.0, 0.66, 0.08, 0.38);
      light(ctx, 1.55, 0.42, 0.06, 0.07, '#fff6c8');
      light(ctx, -1.42, 0.5, 0.05, 0.07, '#ff4b4b');
      bumper(ctx, 1.25, 0.04, 0.45, 0.16);
      highlight(ctx, [1.2, 0.6, 0.5, 0.63]);
      break;
    }
    case 'buggy': {
      // tub
      const outline = [-1.22, -0.14, 1.12, -0.16, 1.38, 0.12, 1.15, 0.24, -1.25, 0.26];
      poly(ctx, outline);
      bodyFill(ctx, paint, -0.16, 0.26);
      drawDecal(ctx, decal, style);
      // fenders
      ctx.lineWidth = 0.09;
      ctx.lineCap = 'round';
      ctx.strokeStyle = shade(paint, -0.15);
      ctx.beginPath();
      ctx.arc(1.06, -0.62, 0.62, Math.PI * 0.25, Math.PI * 0.72);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-1.0, -0.62, 0.62, Math.PI * 0.28, Math.PI * 0.75);
      ctx.stroke();
      // roll cage
      ctx.strokeStyle = '#2c2b38';
      ctx.lineWidth = 0.075;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-0.95, 0.24);
      ctx.lineTo(-0.78, 0.98);
      ctx.lineTo(0.05, 0.98);
      ctx.lineTo(0.5, 0.24);
      ctx.moveTo(-0.78, 0.98);
      ctx.lineTo(-0.2, 0.24);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(-0.76, 1.0);
      ctx.lineTo(0.03, 1.0);
      ctx.stroke();
      // spare tire
      ctx.beginPath();
      ctx.arc(-1.32, 0.42, 0.24, 0, Math.PI * 2);
      ctx.fillStyle = '#26252f';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-1.32, 0.42, 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#8b8fa3';
      ctx.fill();
      light(ctx, 1.3, 0.16, 0.07, 0.07, '#fff6c8');
      break;
    }
  }
};

const drawDecal = (ctx: Ctx, decal: string, style: VehicleStyle): void => {
  if (decal === 'none') return;
  const a = ANCHORS[style];
  const midY = style === 'monster' ? 0.38 : style === 'buggy' ? 0.05 : 0.08;
  const [x0, , x1] = a.bounds;
  ctx.save();
  ctx.clip();
  switch (decal) {
    case 'stripes':
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(x0, midY + 0.02, x1 - x0, 0.06);
      ctx.fillRect(x0, midY - 0.08, x1 - x0, 0.06);
      break;
    case 'number': {
      const cx = style === 'monster' ? -0.1 : -0.1;
      ctx.beginPath();
      ctx.arc(cx, midY + 0.02, 0.17, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.save();
      ctx.translate(cx, midY + 0.02);
      ctx.scale(1, -1);
      ctx.fillStyle = '#1c1b2e';
      ctx.font = 'bold 0.2px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('77', 0, 0.01);
      ctx.restore();
      break;
    }
    case 'flames': {
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      const fx = x1 - 0.1;
      ctx.moveTo(fx, midY - 0.14);
      for (let i = 0; i < 5; i++) {
        const x = fx - 0.3 - i * 0.28;
        ctx.quadraticCurveTo(x + 0.15, midY + 0.22 - (i % 2) * 0.06, x, midY + 0.02);
        ctx.quadraticCurveTo(x + 0.08, midY - 0.06, x - 0.02, midY - 0.14);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fb5607';
      ctx.fillRect(fx - 1.6, midY - 0.15, 1.6, 0.07);
      break;
    }
    case 'bolt':
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(-0.9, midY + 0.1);
      ctx.lineTo(0.0, midY + 0.12);
      ctx.lineTo(-0.15, midY + 0.02);
      ctx.lineTo(0.75, midY + 0.02);
      ctx.lineTo(-0.2, midY - 0.12);
      ctx.lineTo(-0.05, midY - 0.02);
      ctx.closePath();
      ctx.fill();
      break;
    case 'checker': {
      const s = 0.09;
      for (let i = 0; i * s < x1 - x0; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#1c1b2e';
          ctx.fillRect(x0 + i * s, midY - s + j * s, s, s);
        }
      }
      break;
    }
    case 'eyes': {
      const ex = (style === 'super' ? 1.15 : style === 'muscle' ? 1.25 : 0.95);
      const ey = style === 'monster' ? 0.48 : midY + 0.1;
      for (const dx of [0, 0.22]) {
        ctx.beginPath();
        ctx.arc(ex + dx - 0.11, ey, 0.1, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 0.02;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex + dx - 0.08, ey - 0.02, 0.045, 0, Math.PI * 2);
        ctx.fillStyle = '#111';
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
};

/** Accessory drawn at the roof/rear anchor. */
export const drawAccessory = (ctx: Ctx, style: VehicleStyle, accessory: string, paint: string, time: number, speed: number): void => {
  const a = ANCHORS[style];
  const [rx, ry] = a.roof;
  switch (accessory) {
    case 'spoiler': {
      const [sx, sy] = a.rear;
      ctx.fillStyle = '#26252f';
      ctx.fillRect(sx + 0.05, sy - 0.02, 0.05, 0.16);
      ctx.fillRect(sx + 0.3, sy - 0.02, 0.05, 0.16);
      poly(ctx, [sx - 0.15, sy + 0.14, sx + 0.5, sy + 0.16, sx + 0.48, sy + 0.24, sx - 0.12, sy + 0.24]);
      ctx.fillStyle = shade(paint, -0.3);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.03;
      ctx.stroke();
      break;
    }
    case 'flag': {
      const bx = rx - 0.35;
      ctx.strokeStyle = '#3a3a4a';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(bx, ry);
      ctx.lineTo(bx - 0.1, ry + 0.8);
      ctx.stroke();
      const wave = Math.sin(time * (8 + speed * 0.6)) * 0.05;
      ctx.beginPath();
      ctx.moveTo(bx - 0.1, ry + 0.8);
      ctx.quadraticCurveTo(bx - 0.3, ry + 0.78 + wave, bx - 0.5, ry + 0.74 - wave);
      ctx.lineTo(bx - 0.48, ry + 0.56 - wave);
      ctx.quadraticCurveTo(bx - 0.3, ry + 0.6 + wave, bx - 0.08, ry + 0.6);
      ctx.closePath();
      ctx.fillStyle = '#ff3d6e';
      ctx.fill();
      break;
    }
    case 'lights': {
      ctx.fillStyle = '#26252f';
      ctx.fillRect(rx - 0.35, ry, 0.7, 0.1);
      for (let i = 0; i < 4; i++) light(ctx, rx - 0.26 + i * 0.17, ry + 0.06, 0.06, 0.045, '#fff3b0');
      break;
    }
    case 'duck': {
      ctx.save();
      ctx.translate(rx - 0.1, ry + 0.18);
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.2, 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.13, 0.16, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.025;
      ctx.stroke();
      ctx.fillStyle = '#ff8c1a';
      poly(ctx, [0.21, 0.17, 0.33, 0.15, 0.21, 0.12]);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(0.16, 0.19, 0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'crown': {
      ctx.save();
      ctx.translate(rx - 0.1, ry + 0.02);
      poly(ctx, [-0.22, 0, 0.22, 0, 0.26, 0.24, 0.12, 0.12, 0, 0.28, -0.12, 0.12, -0.26, 0.24]);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.strokeStyle = '#a86b00';
      ctx.lineWidth = 0.025;
      ctx.stroke();
      ctx.fillStyle = '#ff3d6e';
      ctx.beginPath();
      ctx.arc(0, 0.08, 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
  }
};

/** Driver: helmet + torso. Origin at the head center. */
export const drawDriver = (ctx: Ctx, helmet: string, lean: number): void => {
  // torso
  ctx.save();
  ctx.rotate(lean * 0.4);
  ctx.beginPath();
  ctx.roundRect(-0.15, -0.5, 0.3, 0.42, 0.1);
  ctx.fillStyle = '#3d5afe';
  ctx.fill();
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
  // helmet
  ctx.beginPath();
  ctx.arc(0, 0, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = helmet;
  ctx.fill();
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // stripe
  ctx.beginPath();
  ctx.arc(0, 0, 0.2, Math.PI * 0.35, Math.PI * 0.65);
  ctx.strokeStyle = '#ff3d6e';
  ctx.lineWidth = 0.06;
  ctx.stroke();
  // visor
  ctx.beginPath();
  ctx.ellipse(0.1, -0.02, 0.1, 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1c2541';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.13, 0.01, 0.035, 0.025, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
};

/** Wheel art at the origin, radius r (y-up). */
export const drawWheel = (ctx: Ctx, r: number, wheelStyle: string, accent: string): void => {
  // tire
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#23222e';
  ctx.fill();
  // tread blocks
  ctx.fillStyle = '#34333f';
  const n = Math.max(10, Math.round(r * 30));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(r * 0.82, -r * 0.07, r * 0.18, r * 0.14);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = '#121119';
  ctx.stroke();
  const rim = r * 0.58;
  const rimColor = wheelStyle === 'gold' ? '#ffcf3f' : wheelStyle === 'neon' ? '#1b1b2a' : '#d4d8e2';
  ctx.beginPath();
  ctx.arc(0, 0, rim, 0, Math.PI * 2);
  ctx.fillStyle = rimColor;
  ctx.fill();
  ctx.lineWidth = r * 0.05;
  ctx.strokeStyle = '#4b4f60';
  ctx.stroke();
  ctx.fillStyle = wheelStyle === 'gold' ? '#c48b00' : '#7d8296';
  ctx.strokeStyle = wheelStyle === 'gold' ? '#c48b00' : '#7d8296';
  switch (wheelStyle) {
    case 'star':
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate((i / 5) * Math.PI * 2);
        poly(ctx, [-rim * 0.16, rim * 0.2, rim * 0.16, rim * 0.2, rim * 0.08, rim * 0.92, -rim * 0.08, rim * 0.92]);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'spoke':
      ctx.lineWidth = r * 0.035;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rim * 0.2, Math.sin(a) * rim * 0.2);
        ctx.lineTo(Math.cos(a + 0.5) * rim * 0.95, Math.sin(a + 0.5) * rim * 0.95);
        ctx.stroke();
      }
      break;
    case 'turbine':
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i / 8) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(0, rim * 0.2);
        ctx.quadraticCurveTo(rim * 0.6, rim * 0.4, rim * 0.3, rim * 0.95);
        ctx.lineTo(0.0, rim * 0.92);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'neon':
      ctx.lineWidth = r * 0.1;
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, rim * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = r * 0.06;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * rim * 0.75, Math.sin(a) * rim * 0.75);
        ctx.stroke();
      }
      break;
    default:
      // classic 5-hole
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, rim * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  // hub
  ctx.beginPath();
  ctx.arc(0, 0, rim * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = wheelStyle === 'neon' ? accent : '#5b6072';
  ctx.fill();
  // rim glint
  ctx.beginPath();
  ctx.arc(0, 0, rim * 0.9, Math.PI * 0.55, Math.PI * 0.95);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = r * 0.05;
  ctx.stroke();
};
