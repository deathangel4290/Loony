import type { HudState } from '../../game/GameView';
import type { TutorialPrompt } from '../../game/Tutorial';
import { fmt, h, qs } from '../dom';
import { icon } from '../icons';
import type { Screen } from '../UIManager';
import type { UIContext } from '../types';

/**
 * Minimal in-run HUD. Values are diffed so the DOM is only touched when
 * something visible actually changes.
 */
export class HudScreen implements Screen {
  el = h('div', 'hud');
  readonly touchLayer: HTMLElement;
  private dist: HTMLElement;
  private best: HTMLElement;
  private score: HTMLElement;
  private fuel: HTMLElement;
  private fuelBar: HTMLElement;
  private health: HTMLElement;
  private healthBar: HTMLElement;
  private combo: HTMLElement;
  private comboMult: HTMLElement;
  private comboBar: HTMLElement;
  private live: HTMLElement;
  private coins: HTMLElement;
  private gas: HTMLElement;
  private brake: HTMLElement;
  private banner: HTMLElement;
  private fpsEl: HTMLElement;
  private last: Record<string, string | number | boolean> = {};

  constructor(private c: UIContext) {
    this.el.innerHTML = `
      <div class="touch-layer"></div>
      <div class="tl"><div class="dist">0<small> m</small></div><div class="sub-line"><span class="best"></span><span class="score"></span></div></div>
      <div class="tc">
        <div class="fuel-gauge">${icon('fuel')}<div class="bar"><i style="width:100%"></i></div></div>
        <div class="health-gauge">${icon('heart')}<div class="bar"><i style="width:100%"></i></div></div>
        <div class="combo"><div class="mult">x1</div><div class="bar"><i></i></div></div>
        <div class="live-trick"></div>
      </div>
      <div class="tr"><div class="chip coin">${icon('coin')}<span>0</span></div></div>
      <div class="pedal brake">${icon('pedalL')}<span>BRAKE</span></div>
      <div class="pedal gas">${icon('pedalR')}<span>GAS</span></div>
      <div class="tutorial-banner"><h3></h3><p></p></div>
      <div class="fps" style="display:none"></div>`;
    this.touchLayer = qs(this.el, '.touch-layer');
    this.dist = qs(this.el, '.dist');
    this.best = qs(this.el, '.best');
    this.score = qs(this.el, '.score');
    this.fuel = qs(this.el, '.fuel-gauge');
    this.fuelBar = qs(this.el, '.fuel-gauge .bar > i');
    this.health = qs(this.el, '.health-gauge');
    this.healthBar = qs(this.el, '.health-gauge .bar > i');
    this.combo = qs(this.el, '.combo');
    this.comboMult = qs(this.el, '.combo .mult');
    this.comboBar = qs(this.el, '.combo .bar > i');
    this.live = qs(this.el, '.live-trick');
    this.coins = qs(this.el, '.tr .chip');
    this.gas = qs(this.el, '.pedal.gas');
    this.brake = qs(this.el, '.pedal.brake');
    this.banner = qs(this.el, '.tutorial-banner');
    this.fpsEl = qs(this.el, '.fps');
    const pause = h('button', 'icon-btn pause-btn', icon('pause'));
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('click', () => c.app.pause());
    qs(this.el, '.tr').append(pause);
  }

  onShow(): void {
    this.last = {};
    this.el.classList.toggle('swapped', this.c.services.settings.values.controlsSwapped);
    this.fpsEl.style.display = this.c.services.settings.values.showFps ? '' : 'none';
    this.setPrompt(null);
    this.setPedals(false, false);
  }

  /** Screen-space center of the coin counter, in CSS pixels. */
  coinAnchor(): [number, number] {
    const r = this.coins.getBoundingClientRect();
    return [r.left + 22, r.top + r.height / 2];
  }

  private set(key: string, value: string | number | boolean, apply: () => void): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    apply();
  }

  update(): void {
    /* driven by render() from the app loop */
  }

  render(s: HudState): void {
    const d = Math.floor(s.distance);
    this.set('d', d, () => (this.dist.innerHTML = `${fmt(d)}<small> m</small>`));
    const best = Math.floor(s.best);
    const beat = best > 0 && d > best;
    const goalLeft = s.goal > 0 ? Math.max(0, Math.ceil(s.goal - s.distance)) : -1;
    this.set('b', `${beat ? -1 : best}:${goalLeft}`, () => {
      if (s.goal > 0) this.best.textContent = goalLeft > 0 ? `GOAL ${fmt(s.goal)} m · ${fmt(goalLeft)} to go` : 'GOAL REACHED!';
      else this.best.textContent = beat ? 'NEW BEST!' : best > 0 ? `BEST ${fmt(best)} m` : '';
    });
    this.set('s', s.score, () => (this.score.textContent = `${fmt(s.score)} pts`));
    const f = Math.round(s.fuel * 200) / 2;
    this.set('f', f, () => (this.fuelBar.style.width = `${f}%`));
    this.set('lf', s.lowFuel, () => this.fuel.classList.toggle('low', s.lowFuel));
    const hp = Math.round(s.health * 50) / 50;
    this.set('hp', hp, () => {
      this.healthBar.style.width = `${hp * 100}%`;
      this.health.classList.toggle('show', hp < 0.999);
    });
    this.set('c', s.coins, () => (this.coins.lastElementChild!.textContent = fmt(s.coins)));
    const comboOn = s.multiplier > 1;
    this.set('co', comboOn, () => this.combo.classList.toggle('show', comboOn));
    this.set('cm', s.multiplier, () => {
      this.comboMult.textContent = `x${s.multiplier} COMBO`;
      this.comboMult.classList.remove('pop');
      void this.comboMult.offsetWidth;
      this.comboMult.classList.add('pop');
    });
    this.comboBar.style.width = `${Math.round(s.comboFrac * 100)}%`;
    let live = '';
    if (s.liveFlips > 0) live = `${s.liveFlips} FLIP${s.liveFlips > 1 ? 'S' : ''}!`;
    else if (s.wheelie > 0.6) live = `WHEELIE ${s.wheelie.toFixed(1)}s`;
    this.set('lv', live, () => {
      this.live.textContent = live;
      this.live.classList.toggle('show', !!live);
    });
  }

  pulse(what: 'coin' | 'fuel' | 'score'): void {
    const el = what === 'coin' ? this.coins : what === 'fuel' ? this.fuel : this.score;
    const cls = what === 'fuel' ? 'refill' : 'bump';
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  setPedals(gas: boolean, brake: boolean): void {
    this.gas.classList.toggle('down', gas);
    this.brake.classList.toggle('down', brake);
  }

  setPrompt(p: TutorialPrompt | null): void {
    this.gas.classList.toggle('hint', p?.highlight === 'gas' || p?.highlight === 'both');
    this.brake.classList.toggle('hint', p?.highlight === 'brake' || p?.highlight === 'both');
    this.el.classList.toggle('hl-fuel', p?.highlight === 'fuel');
    if (p) {
      qs(this.banner, 'h3').textContent = p.title;
      qs(this.banner, 'p').textContent = p.body;
      this.banner.classList.add('show');
    } else this.banner.classList.remove('show');
  }

  setFps(fps: number, extra: string): void {
    if (this.fpsEl.style.display === 'none') return;
    this.fpsEl.textContent = `${fps} FPS ${extra}`;
  }
}
