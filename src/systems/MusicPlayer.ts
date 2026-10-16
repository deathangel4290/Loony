import { Random } from '../core/Random';
import type { MusicDef } from '../data/types';

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface Phrase {
  /** Per 16th step: scale degree offset (relative to chord root) or null. */
  lead: (number | null)[];
  bassSteps: number[];
}

/**
 * Generative step sequencer. Each world gets its own key, mode, tempo, groove
 * and seeded melody so the soundtrack has identity without audio assets.
 * Uses the standard look-ahead scheduling pattern for rock-solid timing.
 */
export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private out!: AudioNode;
  private noise!: AudioBuffer;
  private def: MusicDef | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private phrases: Phrase[] = [];
  private bus!: GainNode;
  /** 0..1, raises drum/lead presence during gameplay. */
  intensity = 1;

  attach(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): void {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
  }

  play(def: MusicDef, seed: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.def === def && this.timer) return;
    this.stop();
    this.def = def;
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
    this.bus.connect(this.out);
    this.phrases = this.compose(def, seed);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx && this.bus) {
      const b = this.bus;
      const t = this.ctx.currentTime;
      b.gain.cancelScheduledValues(t);
      b.gain.setTargetAtTime(0.0001, t, 0.15);
      setTimeout(() => b.disconnect(), 900);
    }
    this.def = null;
  }

  private compose(def: MusicDef, seed: number): Phrase[] {
    const rng = new Random(seed);
    const phrases: Phrase[] = [];
    for (let p = 0; p < 2; p++) {
      const lead: (number | null)[] = [];
      let deg = rng.pick([0, 2, 4]);
      for (let s = 0; s < 64; s++) {
        const strong = s % 4 === 0;
        const play = strong ? rng.chance(0.72) : s % 2 === 0 ? rng.chance(0.38) : rng.chance(0.12);
        if (play) {
          deg += rng.weighted([-2, -1, 1, 2, 0, 3, -3], (d) => (Math.abs(d) === 1 ? 3 : d === 0 ? 1.2 : Math.abs(d) === 2 ? 1.6 : 0.5));
          if (deg > 7) deg -= 3;
          if (deg < -2) deg += 3;
          // land on chord tones on strong beats
          if (strong && ![0, 2, 4, 7].includes(((deg % 7) + 7) % 7)) deg += 1;
          lead.push(deg);
        } else lead.push(null);
      }
      // second half of phrase echoes the first with a variation at the end
      for (let s = 32; s < 56; s++) lead[s] = lead[s - 32];
      const bassSteps = def.drums === 'break' ? [0, 3, 6, 10, 12] : def.drums === 'half' ? [0, 7, 8] : [0, 6, 8, 14];
      phrases.push({ lead, bassSteps });
    }
    return phrases;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const def = this.def;
    if (!ctx || !def) return;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    const stepDur = 60 / def.bpm / 4;
    // Recover gracefully after the tab was throttled.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.14) {
      const swing = this.step % 2 === 1 ? def.swing * stepDur : 0;
      this.playStep(this.step, this.nextTime + swing, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (64 * 4);
    }
  }

  private playStep(step: number, t: number, stepDur: number): void {
    const def = this.def!;
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const chordDeg = def.progression[bar % def.progression.length];
    const phrase = this.phrases[Math.floor(step / 64) % this.phrases.length];
    const note = (degree: number, octave: number): number => {
      const len = def.scale.length;
      const d = chordDeg + degree;
      const o = Math.floor(d / len);
      const idx = ((d % len) + len) % len;
      return def.root + def.scale[idx] + 12 * (o + octave);
    };
    const inten = this.intensity;

    // Drums
    switch (def.drums) {
      case 'four':
        if (s16 % 4 === 0) this.kick(t, 0.75);
        if (s16 === 4 || s16 === 12) this.snare(t, 0.32 * inten);
        if (s16 % 2 === 0) this.hat(t, s16 % 4 === 2 ? 0.1 : 0.05, inten);
        break;
      case 'break':
        if (s16 === 0 || s16 === 7 || s16 === 10) this.kick(t, 0.75);
        if (s16 === 4 || s16 === 12) this.snare(t, 0.34 * inten);
        this.hat(t, s16 % 4 === 2 ? 0.09 : 0.035, inten);
        break;
      case 'half':
        if (s16 === 0 || s16 === 11) this.kick(t, 0.7);
        if (s16 === 8) this.snare(t, 0.3 * inten);
        if (s16 % 2 === 0) this.hat(t, 0.05, inten);
        break;
      case 'soft':
        if (s16 === 0 || s16 === 10) this.kick(t, 0.45);
        if (s16 % 4 === 2) this.hat(t, 0.04, inten);
        break;
    }

    // Bass
    if (phrase.bassSteps.includes(s16)) {
      const n = note(0, -2) + (s16 === 8 && def.drums === 'four' ? 12 : 0);
      this.tone(t, def.bass, mtof(n), stepDur * (s16 === 0 ? 3 : 1.8), 0.17, 600);
    }

    // Pad chord on bar start
    if (s16 === 0) {
      for (const deg of [0, 2, 4]) this.pad(t, mtof(note(deg, 0)), stepDur * 15, 0.035);
    }

    // Arp
    if (s16 % 2 === 0) {
      const arp = [0, 2, 4, 7][(s16 / 2) % 4];
      this.tone(t, 'triangle', mtof(note(arp, 1)), stepDur * 0.9, 0.035, 2800);
    }

    // Lead
    const ld = phrase.lead[step % 64];
    if (ld !== null && ld !== undefined) {
      this.tone(t, def.lead, mtof(note(ld, 1)), stepDur * 1.6, 0.05 * (0.5 + 0.5 * inten), def.lead === 'sawtooth' ? 2200 : 3200);
    }
  }

  private tone(t: number, type: OscillatorType, f: number, dur: number, vol: number, lp: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private pad(t: number, f: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 14;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private snare(t: number, vol: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t, Math.random());
    s.stop(t + 0.18);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vol * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g2).connect(this.bus);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, vol: number, inten: number): void {
    if (inten < 0.3) return;
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * inten, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }
}
