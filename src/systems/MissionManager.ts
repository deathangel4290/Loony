import type { EventBus } from '../core/EventBus';
import { Random } from '../core/Random';
import { MISSION_SLOTS, MISSION_TEMPLATES, missionReward } from '../data/missions';
import type { MissionType, Reward } from '../data/types';
import { getWorld } from '../data/worlds';
import type { GameEvents } from './events';
import type { RunSummary } from './RunSummary';
import type { MissionState } from './SaveData';
import type { SaveManager } from './SaveManager';

const formatTarget = (type: MissionType, n: number): string =>
  type === 'wheelie' || type === 'airtime' ? String(n) : Math.round(n).toLocaleString('en-US');

/** Rotating set of three missions that steer players towards varied play. */
export class MissionManager {
  constructor(
    private save: SaveManager,
    private events: EventBus<GameEvents>,
    private grant: (r: Reward) => void,
  ) {}

  get active(): MissionState[] {
    return this.save.data.missions.active;
  }

  ensure(): void {
    const m = this.save.data.missions;
    let guard = 0;
    while (m.active.length < MISSION_SLOTS && guard++ < 20) m.active.push(this.generate());
    this.save.markDirty();
  }

  private generate(): MissionState {
    const d = this.save.data;
    const counter = ++d.missions.counter;
    const rng = new Random((d.createdAt ^ Math.imul(counter, 2654435761)) >>> 0);
    const level = d.level;
    const activeTypes = new Set(d.missions.active.map((a) => a.type));
    const pool = MISSION_TEMPLATES.filter(
      (t) => t.minLevel <= level && !activeTypes.has(t.type) && (t.type !== 'worldDistance' || d.unlockedWorlds.length > 1),
    );
    const tpl = rng.weighted(pool.length ? pool : MISSION_TEMPLATES, (t) => t.weight);
    const target = tpl.target(level);
    let world: string | undefined;
    if (tpl.type === 'worldDistance') world = rng.pick(d.unlockedWorlds);
    const text = tpl.text.replace('{n}', formatTarget(tpl.type, target)).replace('{world}', world ? getWorld(world).name : '');
    return {
      id: `m${counter}`,
      type: tpl.type,
      text,
      target,
      progress: 0,
      world,
      reward: missionReward(level, Math.floor(rng.next() * 1000)),
      completed: false,
    };
  }

  /** Applies a finished run. Returns missions completed by this run. */
  applyRun(run: RunSummary): MissionState[] {
    const completed: MissionState[] = [];
    for (const m of this.active) {
      if (m.completed) continue;
      const before = m.progress;
      switch (m.type) {
        case 'distanceRun': m.progress = Math.max(m.progress, run.distance); break;
        case 'distanceTotal': m.progress += run.distance; break;
        case 'flipsTotal': m.progress += run.flips; break;
        case 'flipsRun': m.progress = Math.max(m.progress, run.flips); break;
        case 'coinsTotal': m.progress += run.coinsCollected; break;
        case 'runs': m.progress += 1; break;
        case 'wheelie': m.progress = Math.max(m.progress, Math.floor(run.longestWheelie * 10) / 10); break;
        case 'altitude': m.progress = Math.max(m.progress, run.maxAltitude); break;
        case 'noCrash': if (run.endReason === 'fuel') m.progress = Math.max(m.progress, run.distance); break;
        case 'perfectLandings': m.progress += run.perfectLandings; break;
        case 'airtime': m.progress = Math.max(m.progress, Math.floor(run.longestAirtime * 10) / 10); break;
        case 'worldDistance': if (run.worldId === m.world) m.progress = Math.max(m.progress, run.distance); break;
      }
      m.progress = Math.floor(m.progress * 10) / 10;
      if (m.progress >= m.target && before < m.target) {
        m.progress = m.target;
        m.completed = true;
        completed.push(m);
        this.events.emit('missionCompleted', { mission: m });
      }
    }
    this.save.markDirty();
    return completed;
  }

  claim(id: string): Reward | null {
    const list = this.save.data.missions.active;
    const i = list.findIndex((m) => m.id === id && m.completed);
    if (i < 0) return null;
    const [m] = list.splice(i, 1);
    this.grant(m.reward);
    this.save.data.missions.completedCount += 1;
    list.splice(i, 0, this.generate());
    this.save.markDirty();
    return m.reward;
  }

  get claimableCount(): number {
    return this.active.filter((m) => m.completed).length;
  }
}
