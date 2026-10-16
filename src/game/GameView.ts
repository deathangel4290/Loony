import type { CircleShape, PolygonShape, ChainShape } from 'planck';
import { CONFIG } from '../data/config';
import type { TimeOfDay, VehicleDef, VehiclePhysicsDef, WorldDef } from '../data/types';
import { clamp, clamp01, damp, formatNumber, lerp } from '../core/math';
import { BackgroundRenderer } from '../render/BackgroundRenderer';
import { rgba } from '../render/color';
import { FloatingText } from '../render/FloatingText';
import { ParticleSystem, PK } from '../render/ParticleSystem';
import {
  buildCoinSprites, buildDecorSprites, buildFuelSprite, buildPropSprites, DECOR_VARIANTS, drawSprite, type Sprite,
} from '../render/Sprites';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { VehicleRenderer, type VehicleLook, type VehiclePose } from '../render/VehicleRenderer';
import { Weather } from '../render/Weather';
import type { Services } from '../systems/Services';
import { endReasonText, type RunMode, type RunSummary } from '../systems/RunSummary';
import { autopilot } from './Autopilot';
import { CameraController } from './CameraController';
import { GameSession } from './GameSession';
import type { PropKind } from '../data/types';
import { Tutorial, type TutorialPrompt } from './Tutorial';
import { GhostPlayer, GhostRecorder, type GhostData } from './Ghost';
import { getVehicle } from '../data/vehicles';
import { DEFAULT_LOADOUT } from '../data/cosmetics';
import { resolveLook } from '../render/VehicleRenderer';

export interface GameViewOptions {
  services: Services;
  world: WorldDef;
  vehicle: VehicleDef;
  tuning: VehiclePhysicsDef;
  look: VehicleLook;
  seed: number;
  tutorial: boolean;
  /** Menu attract mode: autopilot, no audio/HUD. */
  demo: boolean;
  ctx: CanvasRenderingContext2D;
  bestDistance: number;
  /** Daily challenge target distance (0 = none). */
  goal?: number;
  mode?: RunMode;
  /** Best attempt to race against, and whether to record this run. */
  ghost?: GhostData | null;
  recordGhost?: boolean;
}

export interface HudState {
  distance: number;
  best: number;
  coins: number;
  fuel: number;
  score: number;
  combo: number;
  multiplier: number;
  comboFrac: number;
  wheelie: number;
  health: number;
  liveFlips: number;
  lowFuel: boolean;
  goal: number;
}

interface Flyer {
  sx: number;
  sy: number;
  t: number;
  tier: number;
}

const PROP_DEBRIS: Record<PropKind, string[]> = {
  crate: ['#c98b4a', '#7b4f24'],
  barrel: ['#e94b3c', '#b3352a'],
  cone: ['#ff7a1a', '#ffffff'],
  snowman: ['#ffffff', '#dfe9f7'],
  boulder: ['#4a3f44', '#ff6b1a'],
  hay: ['#e9c46a', '#c99a3a'],
  tire: ['#23222e', '#5c5f6e'],
};

export class GameView {
  readonly session: GameSession;
  readonly camera = new CameraController();
  readonly particles: ParticleSystem;
  readonly texts = new FloatingText();
  private weather: Weather;
  private bg: BackgroundRenderer;
  private terrainR: TerrainRenderer;
  readonly vehicleR: VehicleRenderer;
  private decorSprites: Map<string, Sprite>;
  private propSprites: Record<PropKind, Sprite>;
  private coinSprites: Sprite[];
  private fuelSprite: Sprite;
  tutorial: Tutorial | null = null;
  private ghost: GhostPlayer | null = null;
  private ghostRenderer: VehicleRenderer | null = null;
  private ghostVisible = false;
  private recorder: GhostRecorder | null = null;
  onPrompt: ((p: TutorialPrompt | null) => void) | null = null;
  onEnded: ((s: RunSummary) => void) | null = null;
  onHudPulse: ((what: 'coin' | 'fuel' | 'score') => void) | null = null;
  physicsDebug = false;
  /** Horizontal framing offset as a fraction of screen width (menu backdrop). */
  frameOffset = 0;
  /** Screen position (device px) where collected coins fly to. */
  coinTarget: [number, number] = [0, 0];

  readonly hud: HudState = { distance: 0, best: 0, coins: 0, fuel: 1, score: 0, combo: 0, multiplier: 1, comboFrac: 0, wheelie: 0, health: 1, liveFlips: 0, lowFuel: false, goal: 0 };
  private time = 0;
  private lastSmashText = -1;
  private flash = 0;
  private pose: VehiclePose = { x: 0, y: 0, a: 0, rx: 0, ry: 0, ra: 0, fx: 0, fy: 0, fa: 0 };
  private rpm = 0;
  private flyers: Flyer[] = [];
  private exhaustTimer = 0;
  private trailTimer = 0;
  private dustTimer = 0;
  private smokeTimer = 0;
  private speedFrac = 0;
  private W = 1;
  private H = 1;
  private ended = false;
  private reducedEffects = false;
  private quality: 'low' | 'medium' | 'high' = 'high';

  constructor(readonly opts: GameViewOptions) {
    const s = opts.services;
    const settings = s.settings.values;
    this.reducedEffects = settings.reducedEffects;
    this.quality = settings.quality;
    this.session = new GameSession({ world: opts.world, vehicle: opts.vehicle, tuning: opts.tuning, seed: opts.seed, tutorial: opts.tutorial, mode: opts.mode });
    if (opts.demo) this.session.player.godMode = true;
    this.particles = new ParticleSystem(600);
    this.particles.budget = s.settings.particleBudget();
    this.camera.shakeScale = settings.reducedShake ? 0.2 : 1;
    const wcount = settings.reducedEffects ? 0 : this.quality === 'low' ? 18 : this.quality === 'medium' ? 32 : 48;
    this.weather = new Weather(opts.world.particle, wcount);
    this.bg = new BackgroundRenderer(opts.world, this.quality);
    this.terrainR = new TerrainRenderer(this.session.gen, opts.world, opts.ctx);
    const ppm = this.quality === 'low' ? 70 : 110;
    this.vehicleR = new VehicleRenderer(opts.vehicle, opts.tuning, opts.look, ppm);
    this.vehicleR.night = opts.world.time === 'night';
    this.decorSprites = buildDecorSprites(opts.world, this.quality === 'low' ? 36 : 56);
    this.propSprites = buildPropSprites(80);
    this.coinSprites = buildCoinSprites(90);
    this.fuelSprite = buildFuelSprite(90);
    this.hud.best = opts.bestDistance;
    this.hud.goal = opts.goal ?? 0;
    this.updatePose(1);
    this.camera.snap({ x: this.pose.x, y: this.pose.y, vx: 0, vy: 0, airborne: false, heightAboveGround: 0, speedFrac: 0 });

    if (opts.tutorial && !opts.demo) {
      this.tutorial = new Tutorial(this.session, (p) => this.onPrompt?.(p));
    }
    if (opts.ghost && opts.ghost.frames.length > 10) {
      this.ghost = new GhostPlayer(opts.ghost);
      const gv = getVehicle(opts.ghost.vehicleId);
      this.ghostRenderer = new VehicleRenderer(gv, gv.physics, { ...resolveLook(gv, DEFAULT_LOADOUT), paint: '#c9d6ff', decal: 'none', accessory: 'none' }, 70);
    }
    if (opts.recordGhost) this.recorder = new GhostRecorder();
    this.bindEvents();
    if (!opts.demo) {
      s.audio.engine.start(opts.vehicle.engine);
      s.audio.music.intensity = 1;
      s.audio.setMuffle(0);
    }
  }

  setTimeOfDay(t: TimeOfDay): void {
    this.bg.setTime(t);
    this.vehicleR.night = t === 'night';
  }

  get timeOfDay(): TimeOfDay {
    return this.bg.timeOfDay;
  }

  setWeather(kind: WorldDef['particle'] | 'none'): void {
    this.weather.setKind(kind);
  }

  private bindEvents(): void {
    const ev = this.session.events;
    const audio = this.opts.services.audio;
    const hap = this.opts.services.haptics;
    const demo = this.opts.demo;

    ev.on('coin', ({ item, streak }) => {
      this.particles.emit({ kind: PK.Sparkle, x: item.x, y: item.y, color: '#fff3b0', count: 4, speed: 2.5, life: 0.4, size: 0.18 });
      if (demo) return;
      audio.play(item.tier === 3 ? 'coinBig' : 'coin', streak);
      hap.light();
      const [sx, sy] = this.worldToScreen(item.x, item.y);
      if (this.flyers.length < 14) this.flyers.push({ sx, sy, t: 0, tier: item.tier });
      if (item.tier === 3) this.texts.spawn(`+${item.value}`, item.x, item.y + 0.6, '#ffd84d', 0.8);
    });
    ev.on('fuel', ({ item }) => {
      this.particles.emit({ kind: PK.Glow, x: item.x, y: item.y, color: '#ff6b6b', count: 10, speed: 3, life: 0.5, size: 0.35 });
      if (demo) return;
      audio.play('fuel');
      hap.success();
      this.texts.spawn('FUEL!', item.x, item.y + 1, '#ff6b6b', 1.0);
      this.onHudPulse?.('fuel');
    });
    ev.on('trick', (e) => {
      const colors: Record<string, string> = {
        backflip: '#7dd3ff', frontflip: '#b388ff', perfect: '#7dff9a', bigair: '#ffd84d', hugeair: '#ffb347',
        longjump: '#ffd84d', closecall: '#ff8fa3', wheelie: '#7dffe0', multi: '#ffffff',
      };
      // Screen-anchored trick feed: one line per award under the combo meter,
      // horizontally following the car so it reads as "your" trick.
      const [carSx] = this.worldToScreen(e.x, e.y);
      const fx = Math.max(0.3, Math.min(0.7, carSx / this.W));
      let i = 0;
      for (const a of e.awards) {
        const sub = a.points > 0 ? `+${formatNumber(a.points * e.multiplier)}` : '';
        this.texts.spawn(a.label, fx, 0.27 + i * 0.105, colors[a.kind] ?? '#fff', a.kind === 'multi' ? 0.8 : 1.15, sub, i * 0.2, 1.7, true);
        i++;
      }
      if (e.multiplier > 1) this.texts.spawn(`COMBO x${e.multiplier}`, fx, 0.27 + i * 0.105, '#ffd84d', 0.9, '', i * 0.2, 1.5, true);
      this.particles.emit({ kind: PK.Confetti, x: e.x, y: e.y + 1, color: '#ffd84d', count: 10, speed: 5, life: 1.0, size: 0.16, gravity: 6, spin: 8 });
      this.particles.emit({ kind: PK.Confetti, x: e.x, y: e.y + 1, color: '#7dd3ff', count: 8, speed: 5, life: 1.0, size: 0.16, gravity: 6, spin: 8 });
      if (demo) return;
      const perfect = e.awards.some((a) => a.kind === 'perfect');
      audio.play('trick', e.combo);
      if (perfect) audio.play('perfect');
      if (e.multiplier > 1) audio.play('combo', e.multiplier);
      hap.medium();
      this.camera.zoomPunch(-0.6);
      this.onHudPulse?.('score');
    });
    ev.on('bail', () => {
      if (demo) return;
      const p = this.session.player.vehicle.chassis.getPosition();
      this.texts.spawn('BAILED!', p.x, p.y + 2, '#ff6b6b', 0.9);
    });
    ev.on('takeoff', () => {
      if (demo) return;
      if (this.session.player.vehicle.speed > 9) audio.play('jump');
    });
    ev.on('land', ({ strength }) => {
      const v = this.session.player.vehicle;
      const k = clamp01((strength - 1.5) / 8);
      this.dustBurst(v.rearWheel.getPosition().x, v.rearWheel.getPosition().y - this.opts.tuning.rearWheel.radius, 4 + k * 10, k);
      this.dustBurst(v.frontWheel.getPosition().x, v.frontWheel.getPosition().y - this.opts.tuning.frontWheel.radius, 4 + k * 10, k);
      if (demo) return;
      audio.play('land', 0.3 + k);
      if (k > 0.35) {
        this.camera.addTrauma(0.12 + k * 0.2);
        hap.medium();
      } else hap.light();
    });
    ev.on('impact', ({ strength, x, y }) => {
      const k = clamp01((strength - 4) / 12);
      this.particles.emit({ kind: PK.Spark, x, y: y - 0.4, color: '#ffd166', count: 6 + Math.round(k * 10), speed: 7, spread: Math.PI, angle: Math.PI / 2, life: 0.35, size: 0.06, gravity: 12 });
      if (demo) return;
      this.camera.addTrauma(0.15 + k * 0.3);
      audio.play('land', 0.8 + k);
      hap.heavy();
    });
    ev.on('scrape', ({ x, y }) => {
      const v = this.session.player.vehicle;
      const vx = v.chassis.getLinearVelocity().x;
      this.particles.emit({ kind: PK.Spark, x, y: y - 0.3, vx: -vx * 0.3, color: '#ffe08a', count: 3, speed: 4, spread: 1.2, angle: Math.PI * 0.75, life: 0.3, size: 0.05, gravity: 10 });
      if (!demo) audio.play('scrape', v.speed / 10);
    });
    ev.on('propHit', ({ kind, x, y, strength }) => {
      this.particles.emit({ kind: PK.Dust, x, y: y - 0.3, color: this.dustColor(), count: 3, speed: 1.5, life: 0.6, size: 0.35, growth: 0.6, drag: 3, alpha: 0.6 });
      if (kind !== 'tire') this.particles.emit({ kind: PK.Debris, x, y, color: PROP_DEBRIS[kind][1], count: 2, speed: 3 + strength * 0.2, life: 0.7, size: 0.1, gravity: 14, spin: 10 });
      if (demo) return;
      audio.play('propHit');
      hap.light();
    });
    ev.on('propBreak', ({ kind, x, y, strength }) => {
      const cols = PROP_DEBRIS[kind];
      for (const c of cols) this.particles.emit({ kind: PK.Debris, x, y, vx: strength * 0.4, color: c, count: 9, speed: 4 + strength * 0.25, life: 1.1, size: 0.16, gravity: 14, spin: 12 });
      this.particles.emit({ kind: PK.Dust, x, y, color: '#d8cfc4', count: 5, speed: 1.5, life: 0.7, size: 0.5, growth: 0.8, alpha: 0.6 });
      if (demo) return;
      audio.play('propHit');
      this.camera.addTrauma(0.1);
      hap.light();
      if (this.time - this.lastSmashText > 0.7) {
        this.lastSmashText = this.time;
        this.texts.spawn('SMASH!', x, y + 0.9, '#ffb347', 0.7, '', 0, 0.8);
      }
    });
    ev.on('crash', ({ reason, x, y }) => {
      if (reason === 'fuel') {
        if (!demo) {
          this.texts.spawn('OUT OF FUEL', x, y + 2.5, '#ff6b6b', 1.2);
          audio.engine.stop();
          audio.setMuffle(0.6, 1);
        }
        return;
      }
      for (const c of ['#ffd166', '#ffffff']) this.particles.emit({ kind: PK.Spark, x, y, color: c, count: 16, speed: 9, life: 0.5, size: 0.07, gravity: 10 });
      this.particles.emit({ kind: PK.Debris, x, y, color: this.opts.look.paint, count: 12, speed: 6, life: 1.4, size: 0.16, gravity: 14, spin: 14 });
      this.particles.emit({ kind: PK.Debris, x, y, color: '#2b2a38', count: 8, speed: 5, life: 1.4, size: 0.12, gravity: 14, spin: 14 });
      this.particles.emit({ kind: PK.Smoke, x, y, color: reason === 'lava' ? '#3a2020' : '#8a8a96', count: 10, speed: 1.6, life: 1.6, size: 0.5, growth: 1.1, alpha: 0.7, gravity: -1.2 });
      if (reason === 'lava') this.particles.emit({ kind: PK.Flame, x, y, color: '#ff7a1a', count: 18, speed: 4, life: 0.8, size: 0.4, gravity: -3 });
      if (demo) return;
      this.camera.addTrauma(0.75);
      this.flash = 1;
      audio.play('crash');
      if (reason === 'lava') audio.play('splash');
      audio.engine.stop();
      audio.loops.silence();
      audio.setMuffle(0.75, 0.3);
      hap.heavy();
      this.texts.spawn(endReasonText[reason], x, y + 2.6, '#ff6b6b', 1.4, '', 0.15, 1.6);
    });
    ev.on('lowFuel', () => {
      if (demo) return;
      audio.play('lowFuel');
      hap.warning();
    });
    ev.on('ended', ({ summary }) => {
      this.ended = true;
      if (!demo) audio.setMuffle(0.55, 0.5);
      this.onEnded?.(summary);
    });
  }

  private dustBurst(x: number, y: number, count: number, k: number): void {
    const col = this.dustColor();
    this.particles.emit({ kind: PK.Dust, x, y, color: col, count: Math.round(count), speed: 2 + k * 3, spread: Math.PI * 0.9, angle: Math.PI / 2, life: 0.7 + k * 0.4, size: 0.3 + k * 0.25, growth: 0.6, drag: 3, alpha: 0.75 });
  }

  private dustColor(): string {
    switch (this.opts.world.terrain.surface) {
      case 'grass': return '#b08a5c';
      case 'sand': return '#f2cf95';
      case 'snow': return '#ffffff';
      case 'road': return '#a5a9bb';
      case 'rock': return '#5b4f55';
    }
  }

  private updatePose(alpha: number): void {
    const v = this.session.player.vehicle;
    const bs = v.bodies;
    const out = this.pose;
    const keys: [keyof VehiclePose, keyof VehiclePose, keyof VehiclePose][] = [['x', 'y', 'a'], ['rx', 'ry', 'ra'], ['fx', 'fy', 'fa']];
    for (let i = 0; i < 3; i++) {
      const p = bs[i].getPosition();
      const prev = v.prev[i];
      out[keys[i][0]] = lerp(prev.x, p.x, alpha);
      out[keys[i][1]] = lerp(prev.y, p.y, alpha);
      out[keys[i][2]] = lerp(prev.a, bs[i].getAngle(), alpha);
    }
  }

  worldToScreen(x: number, y: number): [number, number] {
    const ppm = this.H / this.camera.viewH;
    return [this.W / 2 + (x - this.camera.x) * ppm, this.H / 2 - (y - this.camera.y) * ppm];
  }

  update(dtReal: number): void {
    const dt = Math.min(dtReal, 0.1);
    this.time += dt;
    const s = this.session;
    const v = s.player.vehicle;
    const services = this.opts.services;

    if (this.opts.demo && s.state === 'running') {
      autopilot(s, 9, s.input);
      if (v.chassis.getPosition().x > 2500) s.player.end('quit');
    }
    if (this.tutorial && s.state === 'running') {
      this.tutorial.update(dt);
      s.timeScale = this.tutorial.slowMo;
    }
    const alpha = s.update(dt);
    this.updatePose(alpha);
    if (this.recorder && s.player.alive) this.recorder.sample(s.time, { x: this.pose.x, y: this.pose.y, a: this.pose.a, ra: this.pose.ra, fa: this.pose.fa });
    if (this.ghost) this.ghostVisible = this.ghost.at(s.time) || this.ghostVisible;

    const vel = v.chassis.getLinearVelocity();
    const speed = vel.length();
    this.speedFrac = damp(this.speedFrac, clamp01(speed / this.opts.tuning.topSpeed), 4, dt);
    const ground = Math.min(s.gen.surfaceAt(this.pose.x), s.gen.surfaceAt(this.pose.x + vel.x * 0.5));
    this.camera.aspect = this.W / this.H;
    this.camera.update(dt * (s.state === 'ending' ? 0.6 : 1), {
      x: this.pose.x, y: this.pose.y, vx: vel.x, vy: vel.y, airborne: v.airborne,
      heightAboveGround: Math.max(0, this.pose.y - ground - 1), speedFrac: this.speedFrac,
    });
    const halfW = (this.camera.viewH * (this.W / this.H)) / 2;
    if (this.frameOffset) this.camera.x = this.pose.x + 2 - this.frameOffset * halfW * 2;
    s.viewLeft = this.camera.x - halfW - 4;
    s.viewRight = this.camera.x + halfW + 4;

    this.vehicleR.animate(dt * s.timeScale, vel.x, vel.y, v.chassis.getAngle());
    this.vehicleR.braking = v.braking || (s.input.brake && !v.airborne);
    this.continuousFx(dt);
    this.particles.update(dt * Math.max(0.35, s.timeScale));
    this.texts.update(dt);
    this.weather.update(dt, this.camera.x, this.camera.y, halfW * 2, this.camera.viewH, this.time);
    this.flash = Math.max(0, this.flash - dt * 3);

    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt / 0.5;
      if (f.t >= 1) {
        this.flyers.splice(i, 1);
        this.onHudPulse?.('coin');
      }
    }

    // HUD state
    const h = this.hud;
    h.distance = s.distance;
    h.coins = s.coinValue;
    h.fuel = s.player.fuelFrac;
    h.score = s.score;
    h.combo = s.tricks.combo;
    h.multiplier = s.tricks.multiplier;
    h.comboFrac = s.tricks.combo > 0 ? clamp01(s.tricks.comboTimer / CONFIG.tricks.comboWindow) : 0;
    h.wheelie = s.tricks.wheelieTime;
    h.health = s.player.health;
    h.liveFlips = v.airborne ? s.tricks.liveFlips : 0;
    h.lowFuel = h.fuel < 0.22 && s.player.alive;

    // Audio
    if (!this.opts.demo) {
      const audio = services.audio;
      if (s.player.alive) {
        const targetRpm = v.airborne ? (s.input.gas ? 1 : 0.35) : clamp(v.rpm, 0, 1.05);
        this.rpm = damp(this.rpm, targetRpm, v.airborne ? 3 : 8, dt);
        const throttle = v.throttle;
        audio.engine.update(this.rpm, throttle, v.grounded && throttle > 0 ? 1 : 0, 1);
        audio.loops.update(v.grounded ? this.speedFrac : 0, v.grounded ? Math.max(v.slip, v.braking ? clamp01(speed / 10) : 0) : 0, clamp01((speed - 8) / 18));
        audio.music.intensity = 1;
      } else {
        audio.loops.silence();
      }
    }
  }

  private continuousFx(dt: number): void {
    const s = this.session;
    const v = s.player.vehicle;
    const look = this.opts.look;
    const p = this.pose;
    const alive = s.player.alive;
    const vel = v.chassis.getLinearVelocity();
    const reduced = this.reducedEffects;

    // dust from the drive wheel
    this.dustTimer -= dt;
    if (alive && v.rearGrounded && this.dustTimer <= 0) {
      const sp = vel.length();
      const intensity = Math.max(v.slip, clamp01((sp - 5) / 15) * 0.5);
      if (intensity > 0.1) {
        this.dustTimer = reduced ? 0.12 : 0.04;
        const r = this.opts.tuning.rearWheel.radius;
        this.particles.emit({
          kind: PK.Dust, x: p.rx - 0.2, y: p.ry - r * 0.7, vx: -vel.x * 0.15, vy: 0.4, color: this.dustColor(), count: 1,
          speed: 1 + intensity * 2, angle: Math.PI * 0.8, spread: 0.9, life: 0.6, size: 0.25 + intensity * 0.2, growth: 0.7, drag: 2.5, alpha: 0.6,
        });
        if (this.opts.world.terrain.surface === 'grass' && Math.random() < 0.3) {
          this.particles.emit({ kind: PK.Debris, x: p.rx, y: p.ry - r, vx: -vel.x * 0.2, color: '#5fbf45', count: 1, speed: 3, angle: Math.PI * 0.7, spread: 0.8, life: 0.6, size: 0.08, gravity: 12, spin: 10 });
        }
      }
    }

    // exhaust
    this.exhaustTimer -= dt;
    if (alive && v.throttle > 0 && this.exhaustTimer <= 0) {
      const [ex, ey] = this.vehicleR.anchorWorld(p, 'exhaust');
      const back = Math.PI + p.a;
      switch (look.exhaust) {
        case 'flame':
        case 'blue': {
          this.exhaustTimer = 0.03;
          const col = look.exhaust === 'blue' ? '#5ab8ff' : '#ff8a1f';
          this.particles.emit({ kind: PK.Flame, x: ex, y: ey, vx: vel.x * 0.6, vy: vel.y * 0.6, color: col, count: 1, speed: 3, angle: back, spread: 0.3, life: 0.18, size: 0.22, growth: -0.6 });
          break;
        }
        case 'bubbles':
          this.exhaustTimer = 0.09;
          this.particles.emit({ kind: PK.Bubble, x: ex, y: ey, vx: vel.x * 0.5, color: '#bfefff', count: 1, speed: 1.2, angle: back + 0.4, spread: 0.6, life: 0.9, size: 0.12, growth: 0.1, gravity: -1.5, alpha: 0.8 });
          break;
        default:
          this.exhaustTimer = reduced ? 0.2 : 0.09;
          this.particles.emit({ kind: PK.Smoke, x: ex, y: ey, vx: vel.x * 0.5, vy: vel.y * 0.5, color: '#c9c9d3', count: 1, speed: 1, angle: back, spread: 0.5, life: 0.6, size: 0.14, growth: 0.5, gravity: -0.6, alpha: 0.45 });
      }
    }

    // cosmetic trails
    this.trailTimer -= dt;
    if (alive && look.trail !== 'none' && this.trailTimer <= 0 && vel.length() > 3) {
      this.trailTimer = reduced ? 0.12 : 0.05;
      const x = p.rx;
      const y = p.ry;
      switch (look.trail) {
        case 'sparkle':
          this.particles.emit({ kind: PK.Sparkle, x, y, color: '#fff6b0', count: 1, speed: 0.6, life: 0.6, size: 0.18 });
          break;
        case 'smoke':
          this.particles.emit({ kind: PK.Smoke, x, y: y - 0.2, color: '#e8e8f0', count: 1, speed: 0.6, life: 1, size: 0.35, growth: 0.9, gravity: -0.4, alpha: 0.5 });
          break;
        case 'rainbow': {
          const hue = (this.time * 360) % 360;
          this.particles.emit({ kind: PK.Glow, x, y, color: hslToHex(hue, 90, 60), count: 1, speed: 0.2, life: 0.7, size: 0.3 });
          break;
        }
        case 'hearts':
          this.particles.emit({ kind: PK.Heart, x, y: y + 0.3, color: '#ff5d8f', count: 1, speed: 0.6, angle: Math.PI / 2, spread: 0.6, life: 0.9, size: 0.16, gravity: -1 });
          break;
      }
    }

    // damage smoke
    this.smokeTimer -= dt;
    const hp = s.player.health;
    if (hp < 0.65 && this.smokeTimer <= 0) {
      this.smokeTimer = hp < 0.3 ? 0.05 : 0.12;
      const [hx, hy] = this.vehicleR.anchorWorld(p, 'headlight');
      this.particles.emit({ kind: PK.Smoke, x: hx - 0.3, y: hy + 0.2, color: hp < 0.3 ? '#3a3a44' : '#9a9aa6', count: 1, speed: 0.8, angle: Math.PI / 2, spread: 0.6, life: 1.1, size: 0.25, growth: 0.8, gravity: -1.2, alpha: 0.6 });
    }
  }

  resize(W: number, H: number, dpr: number): void {
    this.W = W;
    this.H = H;
    void dpr;
    this.bg.resize(W, H);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const W = this.W;
    const H = this.H;
    const cam = this.camera;
    const ppm = H / cam.viewH;
    const halfW = W / 2 / ppm;
    const minX = cam.x - halfW - 3;
    const maxX = cam.x + halfW + 3;
    const s = this.session;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.bg.render(ctx, cam.x, cam.y, ppm, this.time);

    // World transform (y-up meters)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(W / 2, H / 2);
    if (cam.shakeRot) ctx.rotate(cam.shakeRot);
    ctx.scale(ppm, -ppm);
    ctx.translate(-cam.x - cam.shakeX, -cam.y - cam.shakeY);

    this.terrainR.renderPools(ctx, minX, maxX, this.time);
    this.renderDecor(ctx, minX, maxX, 0);
    this.terrainR.render(ctx, minX, maxX);
    this.terrainR.renderLavaGlow(ctx, minX, maxX, this.time);
    this.terrainR.renderBridges(ctx, minX, maxX);
    this.renderMarkers(ctx, minX, maxX);
    this.renderDecor(ctx, minX, maxX, 1);
    this.renderCollectibles(ctx, minX, maxX);
    this.renderProps(ctx, minX, maxX);
    this.renderGhost(ctx);
    this.vehicleR.render(ctx, this.pose, this.time, s.player.vehicle.speed);
    this.particles.render(ctx, minX, maxX);
    if (this.physicsDebug) this.renderPhysicsDebug(ctx);

    // Screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.reducedEffects && this.quality !== 'low') this.renderSpeedLines(ctx);
    this.weather.render(ctx, W, H, this.time);
    this.renderFlyers(ctx);
    this.texts.render(ctx, (x, y) => this.worldToScreen(x, y), Math.min(H * 0.07, W * 0.045), W, H);
    if (this.hud.lowFuel && !this.reducedEffects && !this.opts.demo) {
      const a = 0.18 + Math.sin(this.time * 6) * 0.1;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
      g.addColorStop(0, 'rgba(255,40,40,0)');
      g.addColorStop(1, `rgba(255,40,40,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flash > 0 && !this.reducedEffects) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** Translucent replay of the best attempt on this course. */
  private renderGhost(ctx: CanvasRenderingContext2D): void {
    if (!this.ghost || !this.ghostRenderer || !this.ghostVisible) return;
    const g = this.ghost.pose;
    const t = this.ghostRenderer.tuning;
    const c = Math.cos(g.a);
    const sn = Math.sin(g.a);
    const w = (lx: number, ly: number): [number, number] => [g.x + lx * c - ly * sn, g.y + lx * sn + ly * c];
    const [rx, ry] = w(t.rearWheel.x, t.rearWheel.y + 0.06);
    const [fx, fy] = w(t.frontWheel.x, t.frontWheel.y + 0.06);
    ctx.save();
    ctx.globalAlpha = 0.42;
    this.ghostRenderer.render(ctx, { x: g.x, y: g.y, a: g.a, rx, ry, ra: g.ra, fx, fy, fa: g.fa }, this.time, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(g.x, g.y + 1.9);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#e2e8ff';
    ctx.font = '0.42px Lilita One, Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOUR BEST', 0, 0);
    ctx.restore();
  }

  /** The recorded run, for saving as the next ghost. */
  ghostRecording(): number[] | null {
    return this.recorder ? this.recorder.frames : null;
  }

  private renderDecor(ctx: CanvasRenderingContext2D, minX: number, maxX: number, layer: 0 | 1): void {
    const list = this.session.gen.decor;
    let i = lowerBound(list, minX - 3);
    for (; i < list.length; i++) {
      const d = list[i];
      if (d.x > maxX + 3) break;
      if (d.layer !== layer) continue;
      const sp = this.decorSprites.get(`${d.kind}:${d.seed % DECOR_VARIANTS}`);
      if (sp) drawSprite(ctx, sp, d.x, d.y, 0, d.scale, d.flip);
    }
  }

  private renderMarkers(ctx: CanvasRenderingContext2D, minX: number, maxX: number): void {
    const gen = this.session.gen;
    // start gate
    if (minX < 2 && maxX > -2) {
      const y = gen.surfaceAt(0);
      ctx.fillStyle = '#2b2a38';
      ctx.fillRect(-0.15, y, 0.18, 4.4);
      ctx.fillRect(3.2, y, 0.18, 4.4);
      ctx.fillStyle = '#ff3d6e';
      ctx.fillRect(-0.3, y + 3.6, 3.9, 0.9);
      ctx.save();
      ctx.translate(1.55, y + 4.05);
      ctx.scale(1, -1);
      ctx.fillStyle = '#ffffff';
      ctx.font = '0.62px Lilita One, Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('START', 0, 0.04);
      ctx.restore();
      // checker line
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = k % 2 ? '#ffffff' : '#1c1b2e';
        ctx.fillRect(-0.15 + (k % 2) * 0.09, y + k * 0.09, 0.09, 0.09);
      }
    }
    // distance signs every 100 m
    const k0 = Math.max(1, Math.ceil(minX / 100));
    for (let k = k0; k * 100 <= maxX; k++) {
      const x = k * 100;
      const y = gen.surfaceAt(x);
      ctx.fillStyle = '#5b4636';
      ctx.fillRect(x - 0.06, y - 0.2, 0.12, 1.9);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1c1b2e';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.roundRect(x - 0.75, y + 1.35, 1.5, 0.62, 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y + 1.66);
      ctx.scale(1, -1);
      ctx.fillStyle = '#1c1b2e';
      ctx.font = '0.4px Lilita One, Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${x}m`, 0, 0.02);
      ctx.restore();
    }
    // daily challenge goal line
    const goal = this.hud.goal;
    if (goal > 0 && goal > minX - 4 && goal < maxX + 4) {
      const y = gen.surfaceAt(goal);
      ctx.fillStyle = '#2b2a38';
      ctx.fillRect(goal - 3.2, y, 0.18, 4.6);
      ctx.fillRect(goal + 3.0, y, 0.18, 4.6);
      ctx.fillStyle = '#9b5de5';
      ctx.fillRect(goal - 3.4, y + 3.7, 6.8, 0.95);
      ctx.save();
      ctx.translate(goal, y + 4.17);
      ctx.scale(1, -1);
      ctx.fillStyle = '#ffffff';
      ctx.font = '0.62px Lilita One, Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CHALLENGE GOAL', 0, 0.04);
      ctx.restore();
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = k % 2 ? '#ffffff' : '#1c1b2e';
        ctx.fillRect(goal - 0.05, y + k * 0.36, 0.1, 0.36);
      }
    }
    // best distance flag
    const best = this.hud.best;
    if (best > 20 && best > minX && best < maxX && !this.opts.demo) {
      const y = gen.surfaceAt(best);
      ctx.fillStyle = '#2b2a38';
      ctx.fillRect(best - 0.05, y - 0.2, 0.1, 3.4);
      const wave = Math.sin(this.time * 5) * 0.12;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(best + 0.05, y + 3.2);
      ctx.quadraticCurveTo(best + 0.7, y + 3.0 + wave, best + 1.4, y + 3.1 - wave);
      ctx.lineTo(best + 1.4, y + 2.4 - wave);
      ctx.quadraticCurveTo(best + 0.7, y + 2.35 + wave, best + 0.05, y + 2.45);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(best + 0.72, y + 2.78);
      ctx.scale(1, -1);
      ctx.fillStyle = '#1c1b2e';
      ctx.font = '0.32px Lilita One, Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BEST', 0, 0);
      ctx.restore();
    }
  }

  private renderCollectibles(ctx: CanvasRenderingContext2D, minX: number, maxX: number): void {
    const list = this.session.gen.collectibles;
    let i = lowerBound(list, minX - 8);
    const t = this.time;
    for (; i < list.length; i++) {
      const c = list[i];
      if (c.x > maxX + 8) break;
      if (c.collected || c.x < minX - 1 || c.x > maxX + 1) continue;
      if (c.kind === 'coin') {
        const sp = this.coinSprites[c.tier];
        const spin = Math.cos(t * 3.2 + c.phase);
        const bob = Math.sin(t * 2 + c.phase) * 0.06;
        ctx.save();
        ctx.translate(c.x, c.y + bob);
        ctx.scale(Math.max(0.12, Math.abs(spin)), 1);
        drawSprite(ctx, sp, 0, 0, 0, c.tier === 3 ? 1.25 : 1);
        ctx.restore();
      } else {
        const bob = Math.sin(t * 2.4) * 0.1;
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        const g = ctx.createRadialGradient(c.x, c.y + bob, 0.1, c.x, c.y + bob, 1.1);
        g.addColorStop(0, rgba('#ff6b6b', 0.25 + pulse * 0.25));
        g.addColorStop(1, rgba('#ff6b6b', 0));
        ctx.fillStyle = g;
        ctx.fillRect(c.x - 1.2, c.y + bob - 1.2, 2.4, 2.4);
        drawSprite(ctx, this.fuelSprite, c.x, c.y + bob, Math.sin(t * 2) * 0.08, 1.1);
      }
    }
  }

  private renderProps(ctx: CanvasRenderingContext2D, minX: number, maxX: number): void {
    for (const p of this.session.terrain.props) {
      if (p.broken) continue;
      let x = p.x;
      let y = p.y;
      let a = p.a;
      if (p.body) {
        const pos = p.body.getPosition();
        x = pos.x;
        y = pos.y;
        a = p.body.getAngle();
      }
      if (x < minX - 2 || x > maxX + 2) continue;
      drawSprite(ctx, this.propSprites[p.spawn.kind], x, y, a);
    }
  }

  private renderFlyers(ctx: CanvasRenderingContext2D): void {
    if (!this.flyers.length) return;
    const [tx, ty] = this.coinTarget;
    for (const f of this.flyers) {
      const e = f.t * f.t;
      const x = lerp(f.sx, tx, e);
      const y = lerp(f.sy, ty, e) - Math.sin(f.t * Math.PI) * this.H * 0.06;
      const sp = this.coinSprites[f.tier];
      const size = (this.H / this.camera.viewH) * 0.75 * (1 - f.t * 0.5);
      ctx.drawImage(sp.canvas, x - size / 2, y - size / 2, size, size);
    }
  }

  private renderSpeedLines(ctx: CanvasRenderingContext2D): void {
    const f = this.speedFrac;
    if (f < 0.72 || !this.session.player.alive) return;
    const k = (f - 0.72) / 0.28;
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + k * 0.18})`;
    ctx.lineWidth = Math.max(1, this.H * 0.003);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const seed = i * 97.31;
      const y = ((Math.sin(seed) * 0.5 + 0.5) * 0.8 + 0.05) * this.H;
      const len = this.W * (0.08 + 0.1 * k);
      const x = this.W - ((this.time * this.W * (1.6 + (i % 3) * 0.4) + seed * 1000) % (this.W + len));
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
    }
    ctx.stroke();
  }

  private renderPhysicsDebug(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 0.03;
    for (let b = this.session.world.getBodyList(); b; b = b.getNext()) {
      const pos = b.getPosition();
      const ang = b.getAngle();
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(ang);
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        ctx.strokeStyle = f.isSensor() ? '#ff3df2' : b.isStatic() ? '#00ff88' : b.isAwake() ? '#ffe14d' : '#888';
        const sh = f.getShape();
        const type = sh.getType();
        ctx.beginPath();
        if (type === 'circle') {
          const c = sh as CircleShape;
          const ctr = c.getCenter();
          ctx.arc(ctr.x, ctr.y, c.getRadius(), 0, Math.PI * 2);
          ctx.moveTo(ctr.x, ctr.y);
          ctx.lineTo(ctr.x + c.getRadius(), ctr.y);
        } else if (type === 'polygon') {
          const verts = (sh as PolygonShape).m_vertices;
          verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
          ctx.closePath();
        } else if (type === 'chain') {
          const verts = (sh as ChainShape).m_vertices;
          verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        } else if (type === 'edge') {
          const e = sh as unknown as { m_vertex1: { x: number; y: number }; m_vertex2: { x: number; y: number } };
          ctx.moveTo(e.m_vertex1.x, e.m_vertex1.y);
          ctx.lineTo(e.m_vertex2.x, e.m_vertex2.y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  get isEnded(): boolean {
    return this.ended;
  }

  destroy(): void {
    if (!this.opts.demo) {
      this.opts.services.audio.engine.stop();
      this.opts.services.audio.loops.silence();
    }
    this.session.destroy();
    this.particles.clear();
    this.texts.clear();
  }
}

const lowerBound = <T extends { x: number }>(list: T[], x: number): number => {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].x < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const hslToHex = (h: number, s: number, l: number): string => {
  const sl = s / 100;
  const ll = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
};
