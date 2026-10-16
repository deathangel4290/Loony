import { Vec2, World } from 'planck';
import { EventBus } from '../core/EventBus';
import { CONFIG } from '../data/config';
import type { PropKind, VehicleDef, VehiclePhysicsDef, WorldDef } from '../data/types';
import type { EndReason, RunSummary } from '../systems/RunSummary';
import { PlayerController } from './PlayerController';
import { TerrainGenerator, type Collectible } from './TerrainGenerator';
import { PROP_DEFS, TerrainManager, type PropState } from './TerrainManager';
import { TrickSystem, type TrickEvent } from './TrickSystem';
import type { DriveInput } from './VehiclePhysics';

export interface SessionEvents {
  coin: { item: Collectible; streak: number };
  fuel: { item: Collectible };
  trick: TrickEvent & { x: number; y: number };
  comboEnd: { combo: number };
  bail: void;
  takeoff: { x: number; y: number };
  land: { strength: number; x: number; y: number };
  impact: { strength: number; x: number; y: number };
  scrape: { x: number; y: number };
  propHit: { kind: PropKind; x: number; y: number; strength: number };
  propBreak: { kind: PropKind; x: number; y: number; angle: number; strength: number };
  crash: { reason: EndReason; x: number; y: number };
  lowFuel: void;
  ended: { summary: RunSummary };
}

export interface SessionOptions {
  world: WorldDef;
  vehicle: VehicleDef;
  tuning: VehiclePhysicsDef;
  seed: number;
  tutorial?: boolean;
}

export type SessionState = 'running' | 'ending' | 'ended';

/**
 * One run of the game (the "LevelManager"): physics world, streamed terrain,
 * the player, tricks, collectibles and scoring. Has no DOM or rendering
 * dependencies so it can be simulated headlessly for tests and tuning.
 */
export class GameSession {
  readonly events = new EventBus<SessionEvents>();
  readonly world: World;
  readonly gen: TerrainGenerator;
  readonly terrain: TerrainManager;
  readonly player: PlayerController;
  readonly tricks: TrickSystem;
  readonly input: DriveInput = { gas: false, brake: false };

  state: SessionState = 'running';
  time = 0;
  timeScale = 1;
  private accumulator = 0;
  private endTimer = 0;
  coinValue = 0;
  coinCount = 0;
  fuelCollected = 0;
  private coinStreak = 0;
  private coinStreakTimer = 0;
  private collectCursor = 0;
  private wasAirborne = false;
  private scrapeTimer = 0;
  private summaryCache: RunSummary | null = null;
  private chassisBounds: [number, number, number, number];
  /** Camera window, provided by the view so streaming matches what's visible. */
  viewLeft = -20;
  viewRight = 40;

  constructor(readonly opts: SessionOptions) {
    this.world = new World({ gravity: new Vec2(0, -CONFIG.physics.gravity) });
    this.gen = new TerrainGenerator(opts.world, opts.seed, { tutorial: opts.tutorial });
    this.terrain = new TerrainManager(this.world, this.gen);
    this.terrain.update(-40, 60, Infinity);
    this.player = new PlayerController(this.world, opts.vehicle, opts.tuning, this.gen, -12);
    this.tricks = new TrickSystem(
      (e) => {
        const p = this.player.vehicle.chassis.getPosition();
        this.events.emit('trick', { ...e, x: p.x, y: p.y });
      },
      (combo) => this.events.emit('comboEnd', { combo }),
      () => this.events.emit('bail', undefined),
    );
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const part of opts.tuning.bodyParts) {
      for (const pt of part) {
        bounds[0] = Math.min(bounds[0], pt.x);
        bounds[1] = Math.min(bounds[1], pt.y);
        bounds[2] = Math.max(bounds[2], pt.x);
        bounds[3] = Math.max(bounds[3], pt.y);
      }
    }
    this.chassisBounds = bounds as [number, number, number, number];
  }

  get distance(): number {
    return this.player.distance;
  }

  get score(): number {
    return Math.floor(this.distance) * CONFIG.scoring.pointsPerMeter + this.tricks.points + this.coinValue * CONFIG.scoring.pointsPerCoin;
  }

  /** Advance by a real-time frame delta. Returns interpolation alpha. */
  update(frameDt: number): number {
    if (this.state === 'ended') return 1;
    const dt = Math.min(frameDt, 0.1) * this.timeScale;
    this.accumulator += dt;
    const step = CONFIG.physics.step;
    let steps = 0;
    while (this.accumulator >= step && steps < CONFIG.physics.maxStepsPerFrame) {
      this.fixedStep(step);
      this.accumulator -= step;
      steps++;
    }
    if (steps >= CONFIG.physics.maxStepsPerFrame) this.accumulator = 0;

    if (this.state === 'ending') {
      // Slow-mo then ease back while the wreck settles.
      this.endTimer += Math.min(frameDt, 0.1);
      const cfg = CONFIG.crash;
      const crash = this.player.endReason !== 'fuel';
      this.timeScale = crash ? (this.endTimer < cfg.slowMoTime ? cfg.slowMoScale : Math.min(1, this.timeScale + frameDt * 1.5)) : 1;
      if (this.endTimer >= (crash ? cfg.resultsDelay : 0.9)) this.finish();
    }
    return this.accumulator / step;
  }

  private fixedStep(dt: number): void {
    const p = this.player;
    const v = p.vehicle;
    v.storePrev();
    p.beforeStep(dt, this.input);
    this.world.step(dt, CONFIG.physics.velocityIterations, CONFIG.physics.positionIterations);
    p.afterStep(dt);
    this.tricks.step(dt, v, p.alive);
    this.time += dt;

    const pos = v.chassis.getPosition();
    if (p.alive) {
      // Air / landing events for FX
      const air = v.airborne;
      if (air && !this.wasAirborne) this.events.emit('takeoff', { x: pos.x, y: pos.y });
      if (!air && this.wasAirborne && v.wheelImpact > 1.5) this.events.emit('land', { strength: v.wheelImpact, x: pos.x, y: pos.y });
      this.wasAirborne = air;
      if (v.impact > 4) this.events.emit('impact', { strength: v.impact, x: pos.x, y: pos.y });
      this.scrapeTimer -= dt;
      if (v.scraping && this.scrapeTimer <= 0) {
        this.scrapeTimer = 0.08;
        this.events.emit('scrape', { x: pos.x, y: pos.y });
      }
      this.collect(pos.x, pos.y);
      this.updatePropContacts();
      if (!p.lowFuelWarned && p.fuelFrac < 0.22) {
        p.lowFuelWarned = true;
        this.events.emit('lowFuel', undefined);
      }
    }
    if (!p.alive && this.state === 'running') this.beginEnding(p.endReason!);
    this.coinStreakTimer -= dt;
    if (this.coinStreakTimer <= 0) this.coinStreak = 0;
    this.terrain.update(Math.min(this.viewLeft, pos.x - 25), Math.max(this.viewRight, pos.x + 40));
  }

  private collect(cx: number, cy: number): void {
    const items = this.gen.collectibles;
    const v = this.player.vehicle;
    const pts = [v.chassis.getWorldCenter(), v.rearWheel.getPosition(), v.frontWheel.getPosition(), v.chassis.getWorldPoint(new Vec2(this.player.tuning.head.x, this.player.tuning.head.y))];
    while (this.collectCursor > 0 && items[this.collectCursor - 1].x > cx - 10) this.collectCursor--;
    while (this.collectCursor < items.length && items[this.collectCursor].x < cx - 10) this.collectCursor++;
    for (let i = this.collectCursor; i < items.length; i++) {
      const it = items[i];
      if (it.x > cx + 10) break;
      if (it.collected) continue;
      const r = it.kind === 'fuel' ? 1.25 : 0.95;
      for (const p of pts) {
        const dx = p.x - it.x;
        const dy = p.y - it.y;
        if (dx * dx + dy * dy < r * r) {
          it.collected = true;
          if (it.kind === 'coin') {
            this.coinValue += it.value;
            this.coinCount++;
            this.coinStreak++;
            this.coinStreakTimer = 0.6;
            this.events.emit('coin', { item: it, streak: this.coinStreak });
          } else {
            this.player.refuel();
            this.fuelCollected++;
            this.events.emit('fuel', { item: it });
          }
          break;
        }
      }
    }
    void cy;
  }

  /**
   * Props don't collide with the car physically (so they can never trap or
   * launch it). Instead we test overlaps and bat them out of the way.
   */
  private updatePropContacts(): void {
    const v = this.player.vehicle;
    const t = this.player.tuning;
    const cx = v.chassis.getPosition().x;
    const vel = v.chassis.getLinearVelocity();
    const wheels = [
      [v.rearWheel.getPosition(), t.rearWheel.radius],
      [v.frontWheel.getPosition(), t.frontWheel.radius],
    ] as const;
    for (const p of this.terrain.props) {
      if (p.broken || !p.body || Math.abs(p.x - cx) > 4) continue;
      const def = PROP_DEFS[p.spawn.kind];
      const pos = p.body.getPosition();
      let hit = false;
      for (const [w, r] of wheels) {
        const dx = pos.x - w.x;
        const dy = pos.y - w.y;
        const rr = r + def.radius * 0.85;
        if (dx * dx + dy * dy < rr * rr) hit = true;
      }
      if (!hit) {
        const local = v.chassis.getLocalPoint(pos);
        const [x0, y0, x1, y1] = this.chassisBounds;
        if (local.x > x0 - def.radius && local.x < x1 + def.radius && local.y > y0 - def.radius && local.y < y1 + def.radius * 0.5) hit = true;
      }
      if (hit) this.hitProp(p, vel.x, vel.y);
    }
  }

  private hitProp(p: PropState, vx: number, vy: number): void {
    if (!p.body) return;
    const def = PROP_DEFS[p.spawn.kind];
    const speed = Math.hypot(vx, vy);
    const pos = p.body.getPosition();
    if (!p.hit) {
      p.hit = true;
      this.tricks.points += def.points;
      // a small "thunk" so hits are felt without ever stopping the car
      const c = this.player.vehicle.chassis;
      const cv = c.getLinearVelocity();
      c.setLinearVelocity(new Vec2(cv.x * 0.975, cv.y));
    }
    if (def.breakable && speed > 3.2) {
      this.breakProp(p, speed);
      return;
    }
    const dir = vx >= 0 ? 1 : -1;
    const push = Math.max(2.5, speed * 1.15);
    p.body.setAwake(true);
    p.body.setLinearVelocity(new Vec2(vx * 0.4 + dir * push, Math.max(vy, 0) + 2 + speed * 0.25));
    p.body.setAngularVelocity(-dir * (3 + speed * 0.5));
    this.events.emit('propHit', { kind: p.spawn.kind, x: pos.x, y: pos.y, strength: speed });
  }

  private breakProp(p: PropState, strength: number): void {
    const body = p.body;
    if (!body) return;
    const pos = body.getPosition();
    const angle = body.getAngle();
    this.terrain.breakProp(p);
    this.events.emit('propBreak', { kind: p.spawn.kind, x: pos.x, y: pos.y, angle, strength });
  }

  private beginEnding(reason: EndReason): void {
    if (this.state !== 'running') return;
    this.state = 'ending';
    this.endTimer = 0;
    this.input.gas = false;
    this.input.brake = false;
    const p = this.player.vehicle.chassis.getPosition();
    this.tricks.finish();
    this.events.emit('crash', { reason, x: p.x, y: p.y });
  }

  /** Player quit from the pause menu. */
  quit(): void {
    if (this.state !== 'running') return;
    this.player.end('quit');
    this.state = 'ending';
    this.finish();
  }

  private finish(): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.timeScale = 1;
    this.events.emit('ended', { summary: this.summary() });
  }

  summary(): RunSummary {
    if (this.summaryCache && this.state === 'ended') return this.summaryCache;
    const t = this.tricks;
    const dist = Math.floor(this.distance);
    const trickCoins = Math.round(t.points * CONFIG.tricks.coinsPerPoint);
    const distanceCoins = Math.floor((dist / 100) * CONFIG.scoring.distanceCoinsPer100m * this.opts.world.coinMultiplier);
    const xp = Math.round((dist / 100) * CONFIG.scoring.xpPer100m + t.points * CONFIG.tricks.xpPerPoint + this.coinCount * 0.5);
    const s: RunSummary = {
      worldId: this.opts.world.id,
      vehicleId: this.opts.vehicle.id,
      seed: this.opts.seed,
      distance: dist,
      score: this.score,
      coinsCollected: this.coinValue,
      trickCoins,
      distanceCoins,
      coinsEarned: this.coinValue + trickCoins + distanceCoins,
      trickPoints: t.points,
      xpEarned: Math.max(5, xp),
      flips: t.flips,
      backflips: t.backflips,
      frontflips: t.frontflips,
      perfectLandings: t.perfectLandings,
      tricks: t.tricks,
      longestWheelie: t.longestWheelie,
      longestAirtime: t.longestAirtime,
      maxAltitude: Math.max(0, Math.floor(this.player.maxAltitude)),
      bestCombo: t.bestCombo,
      fuelCollected: this.fuelCollected,
      endReason: this.player.endReason ?? 'quit',
      duration: this.time,
    };
    this.summaryCache = s;
    return s;
  }

  destroy(): void {
    this.player.destroy();
    this.terrain.destroy();
  }
}
