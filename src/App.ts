import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { randomSeed } from './core/Random';
import { MENU_MUSIC } from './data/worlds';
import { GameView } from './game/GameView';
import { InputManager } from './systems/InputManager';
import type { RunSummary } from './systems/RunSummary';
import { Services } from './systems/Services';
import { createStorage } from './systems/Storage';
import { h } from './ui/dom';
import { icon } from './ui/icons';
import { resolveLook } from './render/VehicleRenderer';
import { AchievementsScreen } from './ui/screens/AchievementsScreen';
import { dailyWidget } from './ui/screens/daily';
import { GarageScreen } from './ui/screens/GarageScreen';
import { HudScreen } from './ui/screens/HudScreen';
import { MainMenuScreen } from './ui/screens/MainMenuScreen';
import { MissionsScreen } from './ui/screens/MissionsScreen';
import { ResultsScreen } from './ui/screens/ResultsScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { TitleScreen } from './ui/screens/TitleScreen';
import { VehiclesScreen } from './ui/screens/VehiclesScreen';
import { WorldsScreen } from './ui/screens/WorldsScreen';
import type { AppActions, MenuScreenName, UIContext } from './ui/types';
import { UIManager } from './ui/UIManager';
import { rewardText } from './ui/widgets';
import type { DebugMenu } from './debug/DebugMenu';

type Mode = 'boot' | 'title' | 'menu' | 'game';

/**
 * Application root: owns the canvas, the main loop, scene switching between
 * the menu (with a live attract-mode backdrop) and gameplay, pausing, and
 * app lifecycle (backgrounding, resume, hardware back).
 */
export class App implements AppActions {
  readonly services: Services;
  private ui!: UIManager;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input = new InputManager();
  private view: GameView | null = null;
  private mode: Mode = 'boot';
  private paused = false;
  private pauseClose: (() => void) | null = null;
  private hud!: HudScreen;
  private last = 0;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private frameAcc = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 60;
  private dailyShown = false;
  private debug: DebugMenu | null = null;
  private runCount = 0;

  constructor() {
    this.services = new Services(createStorage());
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D;
  }

  async start(): Promise<void> {
    const s = this.services;
    await Promise.all([s.init(), this.loadFonts()]);
    this.ui = new UIManager(s);
    const ctx: UIContext = { services: s, ui: this.ui, app: this };
    this.hud = new HudScreen(ctx);
    this.ui.register('title', new TitleScreen(() => this.onTitleTap()));
    this.ui.register('menu', new MainMenuScreen(ctx));
    this.ui.register('garage', new GarageScreen(ctx));
    this.ui.register('vehicles', new VehiclesScreen(ctx));
    this.ui.register('worlds', new WorldsScreen(ctx));
    this.ui.register('missions', new MissionsScreen(ctx));
    this.ui.register('achievements', new AchievementsScreen(ctx));
    this.ui.register('settings', new SettingsScreen(ctx));
    this.ui.register('hud', this.hud);
    this.ui.register('results', new ResultsScreen(ctx));

    this.input.attach(this.hud.touchLayer);
    this.input.onChange = (st, pressed) => {
      this.hud.setPedals(st.gas, st.brake);
      if (pressed) s.haptics.tap();
    };
    this.input.onPause = () => {
      if (this.mode === 'game' && !this.paused && this.view?.session.state === 'running') this.pause();
      else if (this.paused) this.resume();
    };

    s.events.on('settings', (st) => {
      this.input.swapped = st.controlsSwapped;
      this.resize();
    });
    s.events.on('levelUp', ({ level, reward }) => {
      this.ui.toast({ title: `LEVEL ${level}!`, subtitle: rewardText(reward), icon: 'star', tone: 'blue' });
    });
    s.events.on('achievementUnlocked', ({ def }) => {
      s.audio.play('achievement');
      this.ui.toast({ title: def.name, subtitle: `Trophy unlocked · ${rewardText(def.reward)}`, icon: 'trophy' });
    });
    s.events.on('missionCompleted', ({ mission }) => {
      this.ui.toast({ title: 'Mission complete!', subtitle: mission.text, icon: 'target', tone: 'green' });
    });
    s.settings.apply();
    this.input.swapped = s.settings.values.controlsSwapped;

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility(!document.hidden));
    window.addEventListener('pagehide', () => void s.save.flush());
    const unlock = () => s.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('touchend', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    this.setupNative();
    document.getElementById('rotate-hint')?.classList.add('enabled');

    this.resize();
    // First launch: title -> straight into the tutorial run. Otherwise menu.
    if (!s.save.data.tutorial.completed) {
      this.mode = 'title';
      this.createDemo();
      this.ui.show('title');
    } else {
      this.goMenu();
    }
    const boot = document.getElementById('boot');
    boot?.classList.add('hidden');
    setTimeout(() => boot?.remove(), 500);
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private async loadFonts(): Promise<void> {
    try {
      await Promise.race([
        Promise.all([document.fonts.load('40px "Lilita One"'), document.fonts.load('20px Fredoka'), document.fonts.load('600 20px Fredoka')]),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* fall back to system fonts */
    }
  }

  private setupNative(): void {
    if (!Capacitor.isNativePlatform()) return;
    void CapApp.addListener('appStateChange', ({ isActive }) => this.onVisibility(isActive));
    void CapApp.addListener('backButton', () => {
      if (this.ui.back()) return;
      if (this.mode === 'game' && this.view?.session.state === 'running') this.pause();
    });
    void import('@capacitor/status-bar').then(({ StatusBar }) => StatusBar.hide().catch(() => undefined)).catch(() => undefined);
    void import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide().catch(() => undefined)).catch(() => undefined);
  }

  private onVisibility(active: boolean): void {
    const s = this.services;
    if (!active) {
      if (this.mode === 'game' && !this.paused && this.view?.session.state === 'running') this.pause();
      this.input.reset();
      s.audio.setAppActive(false);
      void s.save.flush();
    } else {
      s.audio.setAppActive(true);
      this.last = performance.now();
    }
  }

  private resize(): void {
    const s = this.services;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const dpr = s.settings.pixelRatio(window.devicePixelRatio || 1);
    this.W = Math.round(w * dpr);
    this.H = Math.round(hgt * dpr);
    this.dpr = dpr;
    if (this.canvas.width !== this.W || this.canvas.height !== this.H) {
      this.canvas.width = this.W;
      this.canvas.height = this.H;
    }
    this.view?.resize(this.W, this.H, dpr);
  }

  // ------------------------------------------------------------- frame

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    const target = this.services.settings.targetFps();
    if (target < 60) {
      this.frameAcc += dt;
      if (this.frameAcc < 1 / target - 0.004) return;
      dt = this.frameAcc;
      this.frameAcc = 0;
    }
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
      if (this.view) this.hud.setFps(this.fps, `· ${this.view.particles.count} fx`);
    }

    const v = this.view;
    if (v) {
      if (!this.paused) {
        if (this.mode === 'game') {
          v.session.input.gas = this.input.state.gas;
          v.session.input.brake = this.input.state.brake;
        }
        v.update(dt);
        if (this.mode === 'menu' && v.isEnded) this.createDemo();
      }
      if (this.mode === 'game') {
        const [cx, cy] = this.hud.coinAnchor();
        v.coinTarget = [cx * this.dpr, cy * this.dpr];
        if (this.ui.current === 'hud') this.hud.render(v.hud);
      }
      v.render(this.ctx);
    } else {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.fillStyle = '#1b1f3b';
      this.ctx.fillRect(0, 0, this.W, this.H);
    }
    this.ui.update(dt);
  };

  // -------------------------------------------------------------- scenes

  private destroyView(): void {
    this.view?.destroy();
    this.view = null;
  }

  private createDemo(): void {
    const s = this.services;
    this.destroyView();
    const vehicle = s.garage.selected;
    const world = s.worlds.selected;
    this.view = new GameView({
      services: s, world, vehicle, tuning: s.upgrades.tuning(vehicle.id), look: resolveLook(vehicle, s.garage.loadout(vehicle.id)),
      seed: randomSeed(), tutorial: false, demo: true, ctx: this.ctx, bestDistance: 0,
    });
    this.view.resize(this.W, this.H, this.dpr);
    this.view.frameOffset = 0.2;
  }

  refreshDemo(): void {
    if (this.mode === 'menu' || this.mode === 'title') {
      this.resize();
      this.createDemo();
    }
  }

  private onTitleTap(): void {
    if (this.mode !== 'title') return;
    this.services.audio.unlock();
    this.startRun();
  }

  goMenu(showDaily = true): void {
    const s = this.services;
    if (this.mode !== 'menu') {
      this.mode = 'menu';
      this.input.enabled = false;
      this.createDemo();
    }
    s.audio.unlock();
    s.audio.playMusic(MENU_MUSIC, 7);
    s.audio.music.intensity = 0.6;
    s.audio.setMuffle(0);
    this.ui.show('menu');
    if (showDaily && !this.dailyShown && s.daily.canClaim() && s.save.data.tutorial.completed && s.save.data.tutorial.garageIntroDone) {
      this.dailyShown = true;
      setTimeout(() => this.openDaily(), 450);
    }
  }

  open(screen: MenuScreenName): void {
    if (this.mode !== 'menu') this.goMenu();
    this.ui.show(screen);
  }

  startRun(): void {
    const s = this.services;
    s.audio.unlock();
    void this.ui.transition(() => {
      this.paused = false;
      this.destroyView();
      const vehicle = s.garage.selected;
      const tutorial = !s.save.data.tutorial.completed;
      const world = tutorial ? s.worlds.selected : s.worlds.selected;
      this.view = new GameView({
        services: s, world, vehicle, tuning: s.upgrades.tuning(vehicle.id), look: resolveLook(vehicle, s.garage.loadout(vehicle.id)),
        seed: randomSeed(), tutorial, demo: false, ctx: this.ctx, bestDistance: s.worlds.best(world.id),
      });
      this.view.resize(this.W, this.H, this.dpr);
      this.view.onPrompt = (p) => this.hud.setPrompt(p);
      this.view.onHudPulse = (w) => this.hud.pulse(w);
      this.view.onEnded = (summary) => this.onRunEnded(summary);
      this.mode = 'game';
      this.input.reset();
      this.input.enabled = true;
      this.runCount++;
      s.audio.playMusic(world.music, world.id.length * 31 + 3);
      s.audio.music.intensity = 1;
      this.ui.show('hud');
    });
  }

  private onRunEnded(summary: RunSummary): void {
    const s = this.services;
    this.input.enabled = false;
    this.input.reset();
    this.hud.setPedals(false, false);
    this.hud.setPrompt(null);
    if (!s.save.data.tutorial.completed) {
      s.save.data.tutorial.completed = true;
      s.save.markDirty();
    }
    const rewards = s.finishRun(summary);
    // Don't keep nudging towards the garage forever if the player skips it.
    if (s.save.data.stats.runs >= 3 && !s.save.data.tutorial.garageIntroDone) {
      s.save.data.tutorial.garageIntroDone = true;
      s.save.markDirty();
    }
    setTimeout(() => this.ui.show('results', rewards), 250);
  }

  pause(): void {
    if (this.mode !== 'game' || this.paused || !this.view || this.view.session.state !== 'running') return;
    const s = this.services;
    this.paused = true;
    this.input.enabled = false;
    this.input.reset();
    s.audio.engine.update(0, 0, 0, 0);
    s.audio.loops.silence();
    s.audio.setMuffle(0.8);
    const card = h('div', 'modal-card pause-card', `<h2>PAUSED</h2>`);
    const actions = h('div', 'modal-actions');
    const resume = h('button', 'btn big green', `${icon('play')} RESUME`);
    resume.addEventListener('click', () => this.resume());
    const restart = h('button', 'btn blue', `${icon('retry')} RESTART`);
    restart.addEventListener('click', () => {
      this.closePause();
      this.restart();
    });
    const home = h('button', 'btn dark', `${icon('home')} QUIT`);
    home.addEventListener('click', () => {
      this.closePause();
      this.endRunEarly();
    });
    actions.append(home, restart, resume);
    const quick = h('div', 'quick');
    const mk = (label: string, ic: string, on: () => boolean, toggle: () => void) => {
      const b = h('button', `btn small ${on() ? 'dark' : 'pink'}`, `${icon(ic)} ${label}`);
      b.addEventListener('click', () => {
        toggle();
        b.className = `btn small ${on() ? 'dark' : 'pink'}`;
      });
      return b;
    };
    const st = s.settings;
    let lastMusic = st.values.musicVolume || 0.6;
    let lastSfx = st.values.sfxVolume || 0.85;
    quick.append(
      mk('Music', 'music', () => st.values.musicVolume > 0, () => {
        if (st.values.musicVolume > 0) {
          lastMusic = st.values.musicVolume;
          st.set('musicVolume', 0);
        } else st.set('musicVolume', lastMusic);
      }),
      mk('Sound', 'sound', () => st.values.sfxVolume > 0, () => {
        if (st.values.sfxVolume > 0) {
          lastSfx = st.values.sfxVolume;
          st.set('sfxVolume', 0);
        } else st.set('sfxVolume', lastSfx);
      }),
      mk('Haptics', 'vibrate', () => st.values.haptics, () => st.set('haptics', !st.values.haptics)),
    );
    card.append(actions, quick);
    const closer = h('button', '');
    closer.dataset.close = '1';
    closer.style.display = 'none';
    card.append(closer);
    closer.addEventListener('click', () => this.resume());
    this.pauseClose = this.ui.modal(card);
  }

  private closePause(): void {
    this.pauseClose?.();
    this.pauseClose = null;
  }

  resume(): void {
    if (!this.paused) return;
    this.closePause();
    this.paused = false;
    this.services.audio.setMuffle(0);
    this.input.reset();
    this.input.enabled = true;
    this.last = performance.now();
  }

  /** Quit from the pause menu: the run still counts and pays out. */
  private endRunEarly(): void {
    this.paused = false;
    this.services.audio.setMuffle(0.5);
    this.view?.session.quit();
  }

  restart(): void {
    this.closePause();
    this.startRun();
  }

  quitRun(to: 'menu' | 'garage'): void {
    void this.ui.transition(() => {
      this.paused = false;
      this.mode = 'boot';
      this.goMenu(to === 'menu');
      if (to === 'garage') {
        const firstTime = !this.services.save.data.tutorial.garageIntroDone;
        this.ui.show('garage', firstTime ? { highlight: 'engine' } : undefined);
      }
    });
  }

  openDaily(): void {
    const card = h('div', 'modal-card', `<h2>DAILY REWARDS</h2><p>Come back every day for bigger prizes!</p>`);
    const close = h('button', 'btn dark small', 'CLOSE');
    close.dataset.close = '1';
    close.dataset.sfx = 'back';
    let closer: () => void = () => undefined;
    card.append(dailyWidget({ services: this.services, ui: this.ui, app: this }, () => {
      (this.ui.get('menu') as MainMenuScreen | undefined)?.refresh();
      setTimeout(() => closer(), 900);
    }), close);
    closer = this.ui.modal(card, { dismissible: true });
  }

  toggleDebug(): void {
    if (!__DEBUG__) return;
    if (this.debug) {
      this.debug.el.remove();
      this.debug = null;
      return;
    }
    void import('./debug/DebugMenu').then(({ DebugMenu }) => {
      this.debug = new DebugMenu(
        { services: this.services, view: () => this.view, restart: () => this.restart(), refresh: () => this.refreshDemo() },
        () => this.toggleDebug(),
      );
      this.ui.root.append(this.debug.el);
    });
  }

  async resetProgress(): Promise<void> {
    await this.services.save.reset();
    this.services.missions.ensure();
    this.services.settings.apply();
    this.services.events.emit('currency', { coins: 0, gems: 0, tokens: 0 });
    this.services.events.emit('profile', undefined);
    this.dailyShown = false;
    this.mode = 'boot';
    this.createDemo();
    this.mode = 'title';
    this.ui.show('title');
  }

  /** Exposed for automated tests. */
  get debugState() {
    return { mode: this.mode, paused: this.paused, screen: this.ui.current, runs: this.runCount, fps: this.fps, view: this.view };
  }
}
