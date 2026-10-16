import { Body, CircleShape, PolygonShape, Vec2, WheelJoint, World, type Contact, type ContactImpulse, type Fixture } from 'planck';
import { CONFIG } from '../data/config';
import type { VehicleDef, VehiclePhysicsDef } from '../data/types';
import { clamp, remap, wrapAngle } from '../core/math';

export type FixtureTag = 'ground' | 'ice' | 'lava' | 'bridge' | 'chassis' | 'wheel' | 'head' | 'prop' | 'wall';

export interface FixtureData {
  tag: FixtureTag;
  /** For props: owning prop index. */
  ref?: number;
}

export const tagOf = (f: Fixture): FixtureTag | undefined => (f.getUserData() as FixtureData | null)?.tag;
const isGroundTag = (t: FixtureTag | undefined): boolean => t === 'ground' || t === 'ice' || t === 'bridge' || t === 'wall';

export interface DriveInput {
  gas: boolean;
  brake: boolean;
}

/** Snapshot of a body transform for render interpolation. */
export interface BodyPose {
  x: number;
  y: number;
  a: number;
}

const VEHICLE_GROUP = -1;
/** Collision categories: the car and props never collide physically. */
export const CAT_GROUND = 0x0001;
export const CAT_VEHICLE = 0x0002;
export const CAT_PROP = 0x0004;

/**
 * Two-wheel rigid-body vehicle on planck (Box2D). Wheel joints provide the
 * suspension springs; we add progressive bump stops, a motor/brake model,
 * arcade air control and per-vehicle traits on top.
 */
export class VehiclePhysics {
  readonly chassis: Body;
  readonly rearWheel: Body;
  readonly frontWheel: Body;
  readonly rearJoint: WheelJoint;
  readonly frontJoint: WheelJoint;
  readonly mass: number;

  // Contact state, refreshed every step.
  rearGrounded = false;
  frontGrounded = false;
  bodyGrounded = false;
  headHit = false;
  lavaHit = false;
  onIce = false;
  /** Average ground normal under the wheels. */
  readonly groundNormal = new Vec2(0, 1);
  airTime = 0;
  groundTime = 0;
  /** Largest chassis impact this step, as a change in velocity (m/s). */
  impact = 0;
  /** Largest wheel landing impulse this step, normalized by mass (m/s). */
  wheelImpact = 0;
  /** Fraction 0..1 of how hard the drive wheels are slipping. */
  slip = 0;
  scraping = false;

  readonly prev: BodyPose[] = [{ x: 0, y: 0, a: 0 }, { x: 0, y: 0, a: 0 }, { x: 0, y: 0, a: 0 }];
  /** Current throttle state actually applied (0..1), for audio/visuals. */
  throttle = 0;
  braking = false;
  /** Seconds of landing boost remaining. */
  boostTime = 0;
  private carriedGas = false;
  private carriedBrake = false;

  private postSolve = (contact: Contact, impulse: ContactImpulse) => this.onPostSolve(contact, impulse);

  constructor(
    readonly world: World,
    readonly def: VehicleDef,
    readonly tuning: VehiclePhysicsDef,
    spawnX: number,
    spawnY: number,
  ) {
    const t = tuning;
    this.chassis = world.createBody({ type: 'dynamic', position: new Vec2(spawnX, spawnY), angularDamping: 0.05, bullet: true });
    for (const part of t.bodyParts) {
      this.chassis.createFixture(new PolygonShape(part.map((p) => new Vec2(p.x, p.y))), {
        density: t.bodyDensity,
        friction: 0.6,
        restitution: 0.05,
        filterGroupIndex: VEHICLE_GROUP,
        filterCategoryBits: CAT_VEHICLE,
        filterMaskBits: CAT_GROUND,
        userData: { tag: 'chassis' } as FixtureData,
      });
    }
    this.chassis.createFixture(new CircleShape(new Vec2(t.head.x, t.head.y), t.headRadius), {
      isSensor: true,
      density: 0,
      filterGroupIndex: VEHICLE_GROUP,
      filterCategoryBits: CAT_VEHICLE,
      filterMaskBits: CAT_GROUND,
      userData: { tag: 'head' } as FixtureData,
    });
    // Shift the center of mass for stability tuning.
    const md = { mass: 0, center: new Vec2(), I: 0 };
    this.chassis.getMassData(md);
    const c = md.center;
    const shifted = new Vec2(c.x + t.comOffset.x, c.y + t.comOffset.y);
    const I = md.I - md.mass * Vec2.dot(c, c) + md.mass * Vec2.dot(shifted, shifted);
    this.chassis.setMassData({ mass: md.mass, center: shifted, I });

    const mkWheel = (w: { x: number; y: number; radius: number }) => {
      const b = world.createBody({
        type: 'dynamic',
        position: new Vec2(spawnX + w.x, spawnY + w.y),
        angularDamping: 0.15,
        bullet: true,
      });
      b.createFixture(new CircleShape(w.radius), {
        density: t.wheelDensity,
        friction: t.wheelFriction,
        restitution: 0.08,
        filterGroupIndex: VEHICLE_GROUP,
        filterCategoryBits: CAT_VEHICLE,
        filterMaskBits: CAT_GROUND,
        userData: { tag: 'wheel' } as FixtureData,
      });
      return b;
    };
    this.rearWheel = mkWheel(t.rearWheel);
    this.frontWheel = mkWheel(t.frontWheel);
    const axis = new Vec2(0, 1);
    const mkJoint = (wheel: Body) =>
      world.createJoint(
        new WheelJoint(
          { enableMotor: true, maxMotorTorque: 0, motorSpeed: 0, frequencyHz: t.suspensionHz, dampingRatio: t.suspensionDamping },
          this.chassis,
          wheel,
          wheel.getPosition(),
          axis,
        ),
      ) as WheelJoint;
    this.rearJoint = mkJoint(this.rearWheel);
    this.frontJoint = mkJoint(this.frontWheel);
    this.mass = this.chassis.getMass() + this.rearWheel.getMass() + this.frontWheel.getMass();
    // Motors don't wake sleeping bodies, so the player's car must never sleep.
    for (const b of this.bodies) b.setSleepingAllowed(false);
    world.on('post-solve', this.postSolve);
    this.storePrev();
  }

  destroy(): void {
    this.world.off('post-solve', this.postSolve);
    this.world.destroyBody(this.rearWheel);
    this.world.destroyBody(this.frontWheel);
    this.world.destroyBody(this.chassis);
  }

  get bodies(): Body[] {
    return [this.chassis, this.rearWheel, this.frontWheel];
  }

  storePrev(): void {
    const bs = this.bodies;
    for (let i = 0; i < 3; i++) {
      const p = bs[i].getPosition();
      this.prev[i].x = p.x;
      this.prev[i].y = p.y;
      this.prev[i].a = bs[i].getAngle();
    }
  }

  get grounded(): boolean {
    return this.rearGrounded || this.frontGrounded;
  }

  get airborne(): boolean {
    return this.airTime > CONFIG.vehicle.groundedGraceTime;
  }

  /** Speed along the chassis forward axis. */
  get forwardSpeed(): number {
    const v = this.chassis.getLinearVelocity();
    const a = this.chassis.getAngle();
    return v.x * Math.cos(a) + v.y * Math.sin(a);
  }

  get speed(): number {
    return this.chassis.getLinearVelocity().length();
  }

  /** 0..1 wheel speed relative to top speed (for engine pitch). */
  get rpm(): number {
    const w = Math.max(Math.abs(this.rearWheel.getAngularVelocity()) * this.tuning.rearWheel.radius,
      Math.abs(this.frontWheel.getAngularVelocity()) * this.tuning.frontWheel.radius);
    return clamp(w / this.tuning.topSpeed, 0, 1.2);
  }

  /** Applies controls and helper forces. Call before world.step(). */
  applyControls(dt: number, input: DriveInput, hasFuel: boolean, landingAngle = 0): void {
    const t = this.tuning;
    const gas = input.gas && hasFuel;
    const reverseWanted = input.brake;
    const air = this.airborne;
    const fwd = this.forwardSpeed;
    const drive = this.def.drive;
    const driven = (rear: boolean) => drive === 'all' || (drive === 'rear') === rear;
    const share = drive === 'all' ? 0.62 : 1;
    const joints: [WheelJoint, boolean, number][] = [
      [this.rearJoint, true, t.rearWheel.radius],
      [this.frontJoint, false, t.frontWheel.radius],
    ];

    // Anti-flip assist: soften torque when pulling a big unintended wheelie.
    const pitch = wrapAngle(this.chassis.getAngle());
    const wheelieBand = this.def.trait === 'burnout' ? [1.25, 1.75] : [0.95, 1.45];
    const assist = this.rearGrounded && !this.frontGrounded ? remap(wheelieBand[0], wheelieBand[1], 1, 0.35, pitch) : 1;

    this.throttle = gas ? 1 : 0;
    this.braking = false;
    for (const [joint, rear, radius] of joints) {
      if (gas) {
        if (driven(rear)) {
          joint.enableMotor(true);
          joint.setMotorSpeed((-t.topSpeed * (this.boostTime > 0 ? CONFIG.boost.topSpeedMul : 1)) / radius);
          joint.setMaxMotorTorque(t.motorTorque * share * assist * (air ? CONFIG.vehicle.airMotorTorqueFactor : 1));
        } else {
          joint.enableMotor(false);
        }
      } else if (reverseWanted) {
        if (fwd > 0.9 && !air) {
          this.braking = true;
          joint.enableMotor(true);
          joint.setMotorSpeed(0);
          joint.setMaxMotorTorque(t.brakeTorque * 0.5);
        } else if (driven(rear) && hasFuel) {
          joint.enableMotor(true);
          joint.setMotorSpeed(t.reverseSpeed / radius);
          joint.setMaxMotorTorque(t.motorTorque * 0.75 * share * (air ? CONFIG.vehicle.airMotorTorqueFactor : 1));
          this.throttle = 0.6;
        } else {
          joint.enableMotor(true);
          joint.setMotorSpeed(0);
          joint.setMaxMotorTorque(t.motorTorque * CONFIG.vehicle.coastTorqueFactor);
        }
      } else {
        // Coasting: grounded wheels get light rolling resistance, airborne
        // wheels spin freely so they meet the ground at road speed.
        const touching = rear ? this.rearGrounded : this.frontGrounded;
        joint.enableMotor(touching);
        joint.setMotorSpeed(0);
        joint.setMaxMotorTorque(t.motorTorque * CONFIG.vehicle.coastTorqueFactor);
      }
    }

    // Pitch damping while balanced on one wheel keeps wheelies and nose-dives
    // controllable instead of snappy.
    if (!air && this.rearGrounded !== this.frontGrounded) {
      const k = this.def.trait === 'burnout' ? 1.2 : 2.4;
      this.chassis.applyTorque(-this.chassis.getInertia() * this.chassis.getAngularVelocity() * k);
    }

    // Air control: steer towards a target spin rate. Predictable and forgiving.
    // A pedal still held from before takeoff is treated as "not meant for the
    // air" and gently levels the car for landing instead; a fresh press in the
    // air spins at full rate (gas = forward, brake = backward).
    if (!air) {
      this.carriedGas = input.gas;
      this.carriedBrake = input.brake;
    } else {
      if (!input.gas) this.carriedGas = false;
      if (!input.brake) this.carriedBrake = false;
    }
    if (air) {
      const w = this.chassis.getAngularVelocity();
      const I = this.chassis.getInertia();
      const angle = this.chassis.getAngle();
      const levelErr = wrapAngle(angle - landingAngle);
      const level = clamp(-levelErr * 2.4, -t.airSpin * 0.65, t.airSpin * 0.65);
      let target: number | null = null;
      if (input.gas) target = this.carriedGas ? level : -t.airSpin;
      else if (input.brake) target = this.carriedBrake ? level : t.airSpin;
      else if (this.def.trait === 'gyro') target = level;
      if (target !== null) {
        const maxTorque = I * t.airSpin * t.airResponse * 1.4;
        this.chassis.applyTorque(clamp(I * (target - w) * t.airResponse, -maxTorque, maxTorque));
      }
    }

    // Landing boost: a short shove along the chassis while grounded.
    if (this.boostTime > 0) {
      this.boostTime = Math.max(0, this.boostTime - dt);
      if (this.grounded && input.gas && hasFuel) {
        const a = this.chassis.getAngle();
        const f = this.mass * CONFIG.boost.accel;
        this.chassis.applyForceToCenter(new Vec2(Math.cos(a) * f, Math.sin(a) * f));
      }
    }

    // Aero downforce while grounded.
    if (t.downforce > 0 && this.grounded) {
      const v2 = this.chassis.getLinearVelocity().lengthSquared();
      const f = t.downforce * v2 * this.mass;
      const a = this.chassis.getAngle();
      this.chassis.applyForceToCenter(new Vec2(Math.sin(a) * f, -Math.cos(a) * f));
    }

    this.applyBumpStops(this.rearJoint, this.rearWheel);
    this.applyBumpStops(this.frontJoint, this.frontWheel);
  }

  /** Progressive bump/droop stops (planck's wheel joint has no limits). */
  private applyBumpStops(joint: WheelJoint, wheel: Body): void {
    const t = this.tuning;
    const tr = joint.getJointTranslation();
    const speed = joint.getJointSpeed();
    const cfg = CONFIG.physics;
    let f = 0;
    if (tr > t.suspensionTravel) {
      // Damped in both directions so bottoming out soaks up energy rather
      // than springing the car back into the air.
      const x = tr - t.suspensionTravel;
      f = Math.max(0, cfg.bumpStopStiffness * x * (1 + x * 6) + cfg.bumpStopDamping * speed * (speed < 0 ? 1.6 : 1)) * this.mass * 0.08;
    } else if (tr < -cfg.droopLimit) {
      const x = tr + cfg.droopLimit;
      f = (cfg.bumpStopStiffness * x * 0.5 + cfg.bumpStopDamping * Math.min(0, speed) * 0.5) * this.mass * 0.08;
    }
    if (f !== 0) {
      const axis = this.chassis.getWorldVector(new Vec2(0, 1));
      const anchor = wheel.getPosition();
      wheel.applyForce(new Vec2(-axis.x * f, -axis.y * f), anchor);
      this.chassis.applyForce(new Vec2(axis.x * f, axis.y * f), anchor);
    }
  }

  /** Reads contact state. Call after world.step(). */
  readContacts(dt: number): void {
    this.rearGrounded = this.wheelTouching(this.rearWheel);
    this.frontGrounded = this.wheelTouching(this.frontWheel);
    this.bodyGrounded = false;
    this.headHit = false;
    for (let ce = this.chassis.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      const fa = c.getFixtureA();
      const fb = c.getFixtureB();
      const mine = fa.getBody() === this.chassis ? fa : fb;
      const other = mine === fa ? fb : fa;
      const tag = tagOf(other);
      if (tag === 'lava') this.lavaHit = true;
      if (!isGroundTag(tag)) continue;
      if (tagOf(mine) === 'head') this.headHit = true;
      else this.bodyGrounded = true;
    }
    if (this.grounded) {
      this.airTime = 0;
      this.groundTime += dt;
    } else if (!this.bodyGrounded) {
      this.airTime += dt;
      this.groundTime = 0;
    } else {
      this.airTime = 0;
    }
    this.scraping = this.bodyGrounded && this.speed > 2.5;

    // Wheel slip: compare wheel surface speed with chassis speed.
    const wr = this.def.drive === 'front' ? this.frontWheel : this.rearWheel;
    const radius = this.def.drive === 'front' ? this.tuning.frontWheel.radius : this.tuning.rearWheel.radius;
    const surface = -wr.getAngularVelocity() * radius;
    const diff = Math.abs(surface - this.forwardSpeed);
    this.slip = this.grounded ? clamp((diff - 1.2) / 6, 0, 1) : 0;
  }

  private wheelTouching(wheel: Body): boolean {
    let touching = false;
    let nx = 0;
    let ny = 0;
    for (let ce = wheel.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      const other = c.getFixtureA().getBody() === wheel ? c.getFixtureB() : c.getFixtureA();
      const tag = tagOf(other);
      if (tag === 'lava') this.lavaHit = true;
      if (!isGroundTag(tag)) continue;
      touching = true;
      if (tag === 'ice') this.onIce = true;
      const wm = c.getWorldManifold(null);
      if (wm) {
        // normal points from A to B; we want it pointing up out of the ground
        const sign = c.getFixtureA().getBody() === wheel ? -1 : 1;
        nx += wm.normal.x * sign;
        ny += wm.normal.y * sign;
      }
    }
    if (touching && (nx !== 0 || ny !== 0)) {
      const len = Math.hypot(nx, ny);
      this.groundNormal.x = nx / len;
      this.groundNormal.y = ny / len;
    }
    return touching;
  }

  beginStep(): void {
    this.impact = 0;
    this.wheelImpact = 0;
    this.lavaHit = false;
    this.onIce = false;
  }

  private onPostSolve(contact: Contact, impulse: ContactImpulse): void {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const ba = fa.getBody();
    const bb = fb.getBody();
    let mine: Fixture;
    let other: Fixture;
    if (ba === this.chassis || ba === this.rearWheel || ba === this.frontWheel) {
      mine = fa;
      other = fb;
    } else if (bb === this.chassis || bb === this.rearWheel || bb === this.frontWheel) {
      mine = fb;
      other = fa;
    } else return;
    if (!isGroundTag(tagOf(other))) return;
    const n = impulse.normalImpulses;
    let total = 0;
    for (let i = 0; i < n.length; i++) total += n[i];
    const tag = tagOf(mine);
    if (tag === 'chassis') this.impact = Math.max(this.impact, total / this.chassis.getMass());
    else if (tag === 'wheel') this.wheelImpact = Math.max(this.wheelImpact, total / this.mass);
  }

  /** Teleport the whole vehicle (debug skip, respawn). */
  teleport(x: number, y: number, angle = 0): void {
    const t = this.tuning;
    const set = (b: Body, lx: number, ly: number) => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      b.setTransform(new Vec2(x + lx * c - ly * s, y + lx * s + ly * c), angle);
      b.setLinearVelocity(new Vec2(0, 0));
      b.setAngularVelocity(0);
      b.setAwake(true);
    };
    set(this.chassis, 0, 0);
    set(this.rearWheel, t.rearWheel.x, t.rearWheel.y);
    set(this.frontWheel, t.frontWheel.x, t.frontWheel.y);
    this.storePrev();
  }
}
