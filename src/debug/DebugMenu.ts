import { Vec2 } from 'planck';
import { VEHICLES } from '../data/vehicles';
import { WORLDS } from '../data/worlds';
import { MAX_UPGRADE_LEVEL } from '../data/upgrades';
import { COSMETICS } from '../data/cosmetics';
import type { GameView } from '../game/GameView';
import type { TimeOfDay, WorldParticle } from '../data/types';
import type { Services } from '../systems/Services';
import { h } from '../ui/dom';

export interface DebugHost {
  services: Services;
  view(): GameView | null;
  restart(): void;
  refresh(): void;
}

/**
 * Developer tools. Only constructed when __DEBUG__ is true, so the whole
 * module is tree-shaken out of release builds.
 */
export class DebugMenu {
  readonly el: HTMLElement;
  private times: TimeOfDay[] = ['day', 'sunset', 'night'];
  private weathers: (WorldParticle | 'none')[] = ['none', 'pollen', 'dust', 'snow', 'paper', 'embers'];
  private wi = 0;

  constructor(private host: DebugHost, onClose: () => void) {
    this.el = h('div', 'debug-panel scroll');
    const s = host.services;
    const add = (label: string, fn: () => void) => {
      const b = h('button', '', label);
      b.addEventListener('click', () => {
        fn();
        s.audio.play('click');
      });
      this.el.append(b);
    };
    this.el.append(h('h3', '', 'DEBUG'));
    add('+10,000 coins', () => s.currency.add('coins', 10000));
    add('+100 gems / +3 tokens', () => {
      s.currency.add('gems', 100);
      s.currency.add('tokens', 3);
    });
    add('+1,000 XP', () => s.progression.addXp(1000));
    add('Unlock all vehicles', () => VEHICLES.forEach((v) => s.garage.grantVehicle(v.id)));
    add('Unlock all worlds', () => WORLDS.forEach((w) => s.worlds.grant(w.id)));
    add('Unlock all cosmetics', () => COSMETICS.forEach((c) => s.garage.grantCosmetic(c.id)));
    add('Max upgrades (current)', () => {
      const lv = s.upgrades.levels(s.garage.selected.id);
      for (const k of Object.keys(lv) as (keyof typeof lv)[]) lv[k] = MAX_UPGRADE_LEVEL;
      s.save.markDirty();
      host.refresh();
    });
    add('Skip +500 m', () => {
      const v = host.view();
      if (!v) return;
      const p = v.session.player;
      const x = p.x + 500;
      v.session.gen.ensure(x + 200);
      v.session.terrain.update(x - 40, x + 60, Infinity);
      p.vehicle.teleport(x, v.session.gen.surfaceAt(x) + 2.2);
      v.camera.snap({ x, y: v.session.gen.surfaceAt(x) + 2, vx: 0, vy: 0, airborne: false, heightAboveGround: 0, speedFrac: 0 });
    });
    add('Refuel', () => host.view()?.session.player.refuel());
    add('Spawn fuel ahead', () => this.spawn('fuel'));
    add('Spawn coins ahead', () => this.spawn('coin'));
    add('Launch car (test air)', () => {
      const c = host.view()?.session.player.vehicle;
      if (!c) return;
      for (const b of c.bodies) b.setLinearVelocity(new Vec2(12, 14));
    });
    add('Toggle god mode', () => {
      const p = host.view()?.session.player;
      if (p) p.godMode = !p.godMode;
    });
    add('Cycle time of day', () => {
      const v = host.view();
      if (!v) return;
      const i = (this.times.indexOf(v.timeOfDay) + 1) % this.times.length;
      v.setTimeOfDay(this.times[i]);
    });
    add('Cycle weather', () => {
      this.wi = (this.wi + 1) % this.weathers.length;
      host.view()?.setWeather(this.weathers[this.wi]);
    });
    add('Toggle FPS counter', () => s.settings.set('showFps', !s.settings.values.showFps));
    add('Toggle physics debug', () => {
      const v = host.view();
      if (v) v.physicsDebug = !v.physicsDebug;
    });
    add('Restart run', () => host.restart());
    add('Reset tutorial', () => {
      s.save.data.tutorial.completed = false;
      s.save.data.tutorial.garageIntroDone = false;
      s.save.markDirty();
    });
    add('Daily reward: next day', () => {
      s.save.data.daily.lastClaimDate = '2000-01-01';
      s.save.markDirty();
    });
    add('Close', onClose);
  }

  private spawn(kind: 'coin' | 'fuel'): void {
    const v = this.host.view();
    if (!v) return;
    const g = v.session.gen;
    const x0 = v.session.player.x + 8;
    const items = kind === 'fuel' ? [x0] : Array.from({ length: 8 }, (_, i) => x0 + i * 1.2);
    for (const x of items) {
      g.collectibles.push({ kind, x, y: g.surfaceAt(x) + 1.1, value: kind === 'coin' ? 25 : 1, tier: kind === 'coin' ? 2 : 0, collected: false, phase: 0 });
    }
    g.collectibles.sort((a, b) => a.x - b.x);
  }
}
