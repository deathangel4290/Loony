export interface InputState {
  gas: boolean;
  brake: boolean;
}

/**
 * Touch + keyboard driving input. Each half of the screen is a pedal; multiple
 * fingers are tracked independently and a finger can slide between pedals.
 * Gas/brake sides swap with the "controls swapped" setting.
 */
export class InputManager {
  readonly state: InputState = { gas: false, brake: false };
  swapped = false;
  enabled = false;
  private pointers = new Map<number, 'gas' | 'brake'>();
  private keys = new Set<string>();
  private layer: HTMLElement | null = null;
  onChange: ((s: InputState, pressed: 'gas' | 'brake' | null) => void) | null = null;
  onPause: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        this.onPause?.();
        return;
      }
      this.keys.add(e.key.toLowerCase());
      this.recompute();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      this.recompute();
    });
    window.addEventListener('blur', () => this.reset());
  }

  /** Attach to the full-screen touch layer of the HUD. */
  attach(layer: HTMLElement): void {
    this.detach();
    this.layer = layer;
    layer.addEventListener('pointerdown', this.down, { passive: false });
    layer.addEventListener('pointermove', this.move, { passive: false });
    layer.addEventListener('pointerup', this.up);
    layer.addEventListener('pointercancel', this.up);
    layer.addEventListener('lostpointercapture', this.up);
    layer.addEventListener('touchstart', this.prevent, { passive: false });
    layer.addEventListener('contextmenu', this.prevent);
  }

  detach(): void {
    const l = this.layer;
    if (!l) return;
    l.removeEventListener('pointerdown', this.down);
    l.removeEventListener('pointermove', this.move);
    l.removeEventListener('pointerup', this.up);
    l.removeEventListener('pointercancel', this.up);
    l.removeEventListener('lostpointercapture', this.up);
    l.removeEventListener('touchstart', this.prevent);
    l.removeEventListener('contextmenu', this.prevent);
    this.layer = null;
    this.reset();
  }

  reset(): void {
    this.pointers.clear();
    this.keys.clear();
    this.recompute();
  }

  private prevent = (e: Event) => e.preventDefault();

  private sideAt(clientX: number): 'gas' | 'brake' {
    const right = clientX >= window.innerWidth / 2;
    return right !== this.swapped ? 'gas' : 'brake';
  }

  private down = (e: PointerEvent) => {
    e.preventDefault();
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    this.pointers.set(e.pointerId, this.sideAt(e.clientX));
    this.recompute();
  };

  private move = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const side = this.sideAt(e.clientX);
    if (this.pointers.get(e.pointerId) !== side) {
      this.pointers.set(e.pointerId, side);
      this.recompute();
    }
  };

  private up = (e: PointerEvent) => {
    if (this.pointers.delete(e.pointerId)) this.recompute();
  };

  private recompute(): void {
    let gas = false;
    let brake = false;
    if (this.enabled) {
      for (const s of this.pointers.values()) {
        if (s === 'gas') gas = true;
        else brake = true;
      }
      const k = this.keys;
      if (k.has('arrowright') || k.has('d') || k.has('arrowup') || k.has('w') || k.has(' ')) gas = true;
      if (k.has('arrowleft') || k.has('a') || k.has('arrowdown') || k.has('s')) brake = true;
    }
    const pressed = gas && !this.state.gas ? 'gas' : brake && !this.state.brake ? 'brake' : null;
    if (gas !== this.state.gas || brake !== this.state.brake) {
      this.state.gas = gas;
      this.state.brake = brake;
      this.onChange?.(this.state, pressed);
    }
  }
}
