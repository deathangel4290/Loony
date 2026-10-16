import type { StorageBackend } from '../systems/Storage';

/** Recorded run: one sample every `interval` seconds of simulation time. */
export interface GhostData {
  key: string;
  vehicleId: string;
  distance: number;
  interval: number;
  /** Flattened [x, y, a, rearAngle, frontAngle] per sample, scaled by 100. */
  frames: number[];
}

const STRIDE = 5;
const SCALE = 100;

export interface GhostPose {
  x: number;
  y: number;
  a: number;
  ra: number;
  fa: number;
}

/** Records the player's car at a fixed rate. Compact enough for local storage. */
export class GhostRecorder {
  readonly frames: number[] = [];
  private next = 0;
  constructor(readonly interval = 0.1, private maxSamples = 6000) {}

  sample(t: number, p: GhostPose): void {
    if (t < this.next || this.frames.length / STRIDE >= this.maxSamples) return;
    this.next = t + this.interval;
    this.frames.push(Math.round(p.x * SCALE), Math.round(p.y * SCALE), Math.round(p.a * SCALE), Math.round(p.ra * SCALE), Math.round(p.fa * SCALE));
  }
}

/** Plays a recorded ghost back with linear interpolation between samples. */
export class GhostPlayer {
  private readonly count: number;
  readonly pose: GhostPose = { x: 0, y: 0, a: 0, ra: 0, fa: 0 };
  constructor(readonly data: GhostData) {
    this.count = Math.floor(data.frames.length / STRIDE);
  }

  /** Returns false once the recording has ended. */
  at(t: number): boolean {
    if (this.count < 2) return false;
    const f = t / this.data.interval;
    const i = Math.floor(f);
    if (i >= this.count - 1) return false;
    const k = f - i;
    const d = this.data.frames;
    const o0 = i * STRIDE;
    const o1 = o0 + STRIDE;
    const lerp = (j: number) => (d[o0 + j] + (d[o1 + j] - d[o0 + j]) * k) / SCALE;
    this.pose.x = lerp(0);
    this.pose.y = lerp(1);
    this.pose.a = lerp(2);
    this.pose.ra = lerp(3);
    this.pose.fa = lerp(4);
    return true;
  }
}

const KEY = 'loony.ghost';

/** Ghosts live outside the main save so the profile stays small. */
export class GhostStore {
  constructor(private storage: StorageBackend) {}

  async load(key: string): Promise<GhostData | null> {
    try {
      const raw = await this.storage.get(KEY);
      if (!raw) return null;
      const g = JSON.parse(raw) as GhostData;
      if (g.key !== key || !Array.isArray(g.frames) || typeof g.interval !== 'number') return null;
      return g;
    } catch {
      return null;
    }
  }

  async saveIfBetter(g: GhostData): Promise<boolean> {
    const prev = await this.load(g.key);
    if (prev && prev.distance >= g.distance) return false;
    await this.storage.set(KEY, JSON.stringify(g));
    return true;
  }
}
