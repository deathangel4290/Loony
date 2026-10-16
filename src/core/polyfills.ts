/**
 * iOS 15 WebKit lacks CanvasRenderingContext2D.roundRect (added in Safari 16).
 * A small path-based polyfill keeps the deployment target at iOS 15.
 */
type RR = (x: number, y: number, w: number, h: number, r?: number | DOMPointInit | (number | DOMPointInit)[]) => void;

const roundRect: RR = function (this: CanvasPath, x, y, w, h, r = 0) {
  let rad = typeof r === 'number' ? r : Array.isArray(r) ? (typeof r[0] === 'number' ? r[0] : r[0]?.x ?? 0) : r.x ?? 0;
  rad = Math.max(0, Math.min(rad, Math.abs(w) / 2, Math.abs(h) / 2));
  this.moveTo(x + rad, y);
  this.lineTo(x + w - rad, y);
  this.arcTo(x + w, y, x + w, y + rad, rad);
  this.lineTo(x + w, y + h - rad);
  this.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  this.lineTo(x + rad, y + h);
  this.arcTo(x, y + h, x, y + h - rad, rad);
  this.lineTo(x, y + rad);
  this.arcTo(x, y, x + rad, y, rad);
  this.closePath();
};

export const installPolyfills = (): void => {
  const ctxProto = CanvasRenderingContext2D.prototype as unknown as { roundRect?: RR };
  if (!ctxProto.roundRect) ctxProto.roundRect = roundRect;
  if (typeof Path2D !== 'undefined') {
    const p = Path2D.prototype as unknown as { roundRect?: RR };
    if (!p.roundRect) p.roundRect = roundRect;
  }
};
