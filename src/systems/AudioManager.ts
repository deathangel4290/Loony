import type { EngineSoundDef, MusicDef } from '../data/types';
import { clamp, clamp01 } from '../core/math';
import { MusicPlayer } from './MusicPlayer';

export type SfxName =
  | 'click' | 'back' | 'coin' | 'coinBig' | 'fuel' | 'jump' | 'land' | 'crash' | 'trick' | 'combo'
  | 'perfect' | 'upgrade' | 'purchase' | 'error' | 'levelUp' | 'achievement' | 'whoosh' | 'scrape'
  | 'propHit' | 'lowFuel' | 'tick' | 'reward' | 'splash' | 'countdown';

/**
 * Fully synthesized audio: no sample files to load, tiny footprint, and every
 * sound can react to gameplay parameters (pitch-shifted coin streaks, landing
 * weight, engine RPM...). Buses: master -> [music, sfx].
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private noiseBuffer!: AudioBuffer;
  private musicVolume = 0.6;
  private sfxVolume = 0.85;
  readonly music = new MusicPlayer();
  readonly engine = new EngineSound();
  readonly loops = new SurfaceLoops();
  private unlocked = false;
  private suspendedByApp = false;

  /** Must be called from a user gesture on iOS. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended' && !this.suspendedByApp) void this.ctx.resume();
    if (!this.unlocked) {
      this.unlocked = true;
      // Play a silent buffer to fully unlock iOS audio.
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.musicFilter);
    this.applyVolumes();

    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.music.attach(ctx, this.musicBus, this.noiseBuffer);
    this.engine.attach(ctx, this.sfxBus);
    this.loops.attach(ctx, this.sfxBus, this.noiseBuffer);
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = clamp01(music);
    this.sfxVolume = clamp01(sfx);
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicVolume * this.musicVolume * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume * this.sfxVolume, t, 0.05);
  }

  /** Muffle music (pause menu, slow-motion crash). 0 = clear, 1 = heavily muffled. */
  setMuffle(amount: number, time = 0.25): void {
    if (!this.ctx) return;
    const f = 18000 * Math.pow(1 - clamp01(amount) * 0.97, 3) + 250;
    this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, time / 3);
  }

  playMusic(def: MusicDef, seed: number): void {
    if (!this.ctx) return;
    this.music.play(def, seed);
  }

  stopMusic(): void {
    this.music.stop();
  }

  /** App backgrounded / foregrounded. */
  setAppActive(active: boolean): void {
    if (!this.ctx) return;
    this.suspendedByApp = !active;
    if (active) void this.ctx.resume();
    else void this.ctx.suspend();
  }

  // -------------------------------------------------------------------------
  // SFX
  // -------------------------------------------------------------------------

  play(name: SfxName, param = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.sfxVolume <= 0) return;
    const t = ctx.currentTime + 0.002;
    switch (name) {
      case 'click': this.blip(t, 'sine', 1150, 780, 0.05, 0.22); break;
      case 'back': this.blip(t, 'sine', 700, 460, 0.06, 0.2); break;
      case 'tick': this.blip(t, 'square', 1800 + param * 30, 1700, 0.018, 0.04); break;
      case 'coin': {
        const p = Math.pow(2, Math.min(param, 12) / 24);
        this.blip(t, 'square', 988 * p, 988 * p, 0.05, 0.07, 3000);
        this.blip(t + 0.05, 'square', 1319 * p, 1319 * p, 0.12, 0.07, 3500);
        break;
      }
      case 'coinBig':
        [1047, 1319, 1568, 2093].forEach((f, i) => this.blip(t + i * 0.045, 'square', f, f, 0.12, 0.06, 4000));
        break;
      case 'fuel':
        [330, 440, 554, 659].forEach((f, i) => this.blip(t + i * 0.06, 'triangle', f, f * 1.05, 0.12, 0.2));
        this.noise(t, 0.25, 'bandpass', 900, 0.08, 3);
        break;
      case 'jump': this.sweepNoise(t, 0.35, 300, 1800, 0.1); break;
      case 'land': {
        const k = clamp(param, 0.2, 1.5);
        this.blip(t, 'sine', 150 * (0.8 + k * 0.2), 42, 0.18 + k * 0.08, 0.5 * k);
        this.noise(t, 0.12 + 0.1 * k, 'lowpass', 500 + 400 * k, 0.25 * k, 1);
        break;
      }
      case 'crash':
        this.noise(t, 0.9, 'lowpass', 2400, 0.55, 1, 300);
        this.blip(t, 'sine', 110, 30, 0.7, 0.8);
        this.fm(t, 196, 3.53, 0.7, 0.18);
        this.fm(t + 0.07, 311, 2.41, 0.5, 0.12);
        break;
      case 'trick': {
        const base = 523 * Math.pow(2, Math.min(param, 6) / 12);
        [1, 1.26, 1.5, 2].forEach((m, i) => this.blip(t + i * 0.055, 'triangle', base * m, base * m, 0.16, 0.16));
        break;
      }
      case 'combo': this.blip(t, 'sawtooth', 400 + param * 80, 900 + param * 160, 0.18, 0.1, 2400); break;
      case 'perfect':
        this.bell(t, 1319, 0.9, 0.22);
        this.bell(t + 0.07, 1976, 0.8, 0.14);
        break;
      case 'upgrade':
        [392, 494, 587, 784, 988].forEach((f, i) => this.blip(t + i * 0.05, 'square', f, f, 0.14, 0.07, 3200));
        this.bell(t + 0.25, 1568, 1.0, 0.12);
        break;
      case 'purchase':
        this.bell(t, 1568, 0.5, 0.16);
        this.bell(t + 0.08, 2093, 0.7, 0.16);
        break;
      case 'error': this.blip(t, 'square', 150, 120, 0.16, 0.12, 900); break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => this.blip(t + i * 0.09, 'square', f, f, 0.2, 0.09, 3000));
        this.bell(t + 0.36, 1568, 1.4, 0.15);
        break;
      case 'achievement':
        [659, 831, 988, 1319].forEach((f, i) => this.blip(t + i * 0.07, 'triangle', f, f, 0.22, 0.17));
        this.bell(t + 0.3, 1976, 1.2, 0.1);
        break;
      case 'reward':
        for (let i = 0; i < 6; i++) this.bell(t + i * 0.05, 1200 + i * 220, 0.4, 0.07);
        break;
      case 'whoosh': this.sweepNoise(t, 0.22, 2000, 500, 0.06); break;
      case 'scrape': this.noise(t, 0.18, 'bandpass', 3200, 0.12 * clamp(param, 0.3, 1.2), 4); break;
      case 'propHit':
        this.blip(t, 'triangle', 320, 140, 0.1, 0.25);
        this.noise(t, 0.06, 'bandpass', 1400, 0.15, 2);
        break;
      case 'lowFuel':
        this.blip(t, 'square', 880, 880, 0.08, 0.06, 2000);
        this.blip(t + 0.14, 'square', 880, 880, 0.08, 0.06, 2000);
        break;
      case 'splash':
        this.noise(t, 0.5, 'lowpass', 900, 0.35, 1);
        this.blip(t, 'sine', 90, 40, 0.4, 0.4);
        break;
      case 'countdown': this.blip(t, 'square', 660, 660, 0.12, 0.08, 2500); break;
    }
  }

  private env(g: GainNode, t: number, peak: number, dur: number, attack = 0.004): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private blip(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, lp = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, dur);
    if (lp > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f).connect(g);
    } else {
      o.connect(g);
    }
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private bell(t: number, f: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.76;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    this.env(g, t, vol, dur, 0.002);
    this.env(g2, t, vol * 0.3, dur * 0.4, 0.002);
    o.connect(g).connect(this.sfxBus);
    o2.connect(g2).connect(this.sfxBus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private fm(t: number, f: number, ratio: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * ratio;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * 4, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(modGain).connect(car.frequency);
    const g = ctx.createGain();
    this.env(g, t, vol, dur, 0.002);
    car.connect(g).connect(this.sfxBus);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, vol: number, q = 1, freqEnd = 0): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd > 0) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, vol, dur, 0.003);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  private sweepNoise(t: number, dur: number, f0: number, f1: number, vol: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }
}

/**
 * Layered engine: main oscillator + detuned double + sub "rumble", through a
 * soft clipper and a throttle-controlled lowpass. Pitch follows wheel RPM;
 * airborne revs rise freely.
 */
export class EngineSound {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private subGain!: GainNode;
  private filter!: BiquadFilterNode;
  private gain!: GainNode;
  private def: EngineSoundDef | null = null;
  private rpm = 0;

  attach(ctx: AudioContext, bus: AudioNode): void {
    this.ctx = ctx;
    this.out = bus as GainNode;
  }

  start(def: EngineSoundDef): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.stop();
    this.def = def;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2.5;
    this.filter.frequency.value = 600;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.oscA = ctx.createOscillator();
    this.oscA.type = def.wave;
    this.oscB = ctx.createOscillator();
    this.oscB.type = def.wave;
    this.oscB.detune.value = 9;
    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    this.subGain = ctx.createGain();
    this.subGain.gain.value = def.rumble * 0.55;
    this.oscA.connect(mix);
    this.oscB.connect(mix);
    this.sub.connect(this.subGain).connect(mix);
    mix.connect(shaper).connect(this.filter).connect(this.gain).connect(this.out);
    const f = def.idle;
    this.oscA.frequency.value = f;
    this.oscB.frequency.value = f;
    this.sub.frequency.value = f / 2;
    const t = ctx.currentTime;
    this.oscA.start(t);
    this.oscB.start(t);
    this.sub.start(t);
    this.rpm = 0;
  }

  /**
   * rpm 0..1 (fraction of redline), throttle 0..1, load 0..1 (grounded & pulling).
   */
  update(rpm: number, throttle: number, load: number, volume: number): void {
    const ctx = this.ctx;
    const def = this.def;
    if (!ctx || !def || !this.oscA || !this.oscB || !this.sub) return;
    this.rpm = clamp01(rpm);
    const t = ctx.currentTime;
    const f = def.idle + (def.redline - def.idle) * this.rpm;
    this.oscA.frequency.setTargetAtTime(f, t, 0.03);
    this.oscB.frequency.setTargetAtTime(f, t, 0.03);
    this.sub.frequency.setTargetAtTime(f / 2, t, 0.03);
    const cutoff = 260 + (700 + 3800 * def.bright) * (0.25 + 0.75 * clamp01(throttle * 0.8 + this.rpm * 0.4));
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.04);
    const g = (0.07 + 0.11 * throttle + 0.05 * load + 0.04 * this.rpm) * volume;
    this.gain.gain.setTargetAtTime(Math.max(0.0001, g), t, 0.05);
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx || !this.oscA) return;
    const t = ctx.currentTime;
    this.gain.gain.setTargetAtTime(0.0001, t, 0.08);
    const nodes = [this.oscA, this.oscB, this.sub];
    for (const n of nodes) n?.stop(t + 0.4);
    this.oscA = this.oscB = this.sub = null;
    this.def = null;
  }
}

/** Continuous tire-roll, skid and wind layers driven by vehicle state. */
export class SurfaceLoops {
  private ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  private rollGain!: GainNode;
  private skidGain!: GainNode;
  private windGain!: GainNode;
  private rollFilter!: BiquadFilterNode;

  attach(ctx: AudioContext, bus: AudioNode, noise: AudioBuffer): void {
    this.ctx = ctx;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 260;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    const skidF = ctx.createBiquadFilter();
    skidF.type = 'bandpass';
    skidF.frequency.value = 1100;
    skidF.Q.value = 3;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    const windF = ctx.createBiquadFilter();
    windF.type = 'bandpass';
    windF.frequency.value = 700;
    windF.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(bus);
    src.connect(skidF).connect(this.skidGain).connect(bus);
    src.connect(windF).connect(this.windGain).connect(bus);
    src.start();
    this.src = src;
  }

  update(roll: number, skid: number, wind: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.src) return;
    const t = ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(clamp01(roll) * 0.22, t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(160 + roll * 420, t, 0.1);
    this.skidGain.gain.setTargetAtTime(clamp01(skid) * 0.09, t, 0.04);
    this.windGain.gain.setTargetAtTime(clamp01(wind) * 0.07, t, 0.1);
  }

  silence(): void {
    this.update(0, 0, 0);
  }
}
