import { xpForNextLevel } from '../../data/rewards';
import { fmt, h, qs } from '../dom';
import { icon } from '../icons';
import type { Screen } from '../UIManager';
import type { MenuScreenName, UIContext } from '../types';
import { currencyBar } from '../widgets';

export class MainMenuScreen implements Screen {
  el = h('div', 'menu');
  private currency;
  private levelEl: HTMLElement;
  private selVehicle: HTMLElement;
  private selWorld: HTMLElement;
  private missionsBadge: HTMLElement;
  private dailyBadge: HTMLElement;

  constructor(private c: UIContext) {
    const s = c.services;
    this.currency = currencyBar(s);
    const top = h('div', 'menu-top');
    this.levelEl = h('div', 'level-badge');
    top.append(this.levelEl, h('div', 'spacer'), this.currency.el);

    const center = h('div', 'menu-center');
    center.innerHTML = `<div class="logo">LOONY<span>WHEELS</span></div>`;
    const playRow = h('div', 'play-row');
    const play = h('button', 'btn big play', `${icon('play')} PLAY`);
    play.dataset.sfx = 'none';
    play.addEventListener('click', () => {
      s.audio.play('countdown');
      c.app.startRun();
    });
    playRow.append(play);
    const sel = h('div', 'selection');
    this.selVehicle = h('button', 'sel-chip');
    this.selWorld = h('button', 'sel-chip');
    this.selVehicle.addEventListener('click', () => c.app.open('vehicles'));
    this.selWorld.addEventListener('click', () => c.app.open('worlds'));
    sel.append(this.selVehicle, this.selWorld);
    center.append(playRow, sel);

    const nav = h('div', 'menu-nav');
    const items: [MenuScreenName | 'daily', string, string, string][] = [
      ['garage', 'Garage', 'wrench', 'c1'],
      ['vehicles', 'Vehicles', 'car', 'c2'],
      ['worlds', 'Worlds', 'globe', 'c3'],
      ['missions', 'Missions', 'target', 'c4'],
      ['daily', 'Daily', 'gift', 'c5'],
      ['achievements', 'Trophies', 'trophy', 'c1'],
      ['settings', 'Settings', 'gear', 'c6'],
    ];
    this.missionsBadge = h('span', 'badge');
    this.dailyBadge = h('span', 'badge', '!');
    for (const [id, label, ic, cls] of items) {
      const b = h('button', `nav-btn ${cls}`, `${icon(ic)}<span>${label}</span>`);
      b.addEventListener('click', () => (id === 'daily' ? c.app.openDaily() : c.app.open(id)));
      if (id === 'missions') b.append(this.missionsBadge);
      if (id === 'daily') b.append(this.dailyBadge);
      nav.append(b);
    }
    this.el.append(top, center, nav);

    s.events.on('currency', () => this.currency.refresh());
    s.events.on('xp', () => this.refresh());
    s.events.on('profile', () => this.refresh());
  }

  refresh(): void {
    const s = this.c.services;
    const lv = s.progression.snapshot();
    const need = xpForNextLevel(lv.level);
    this.levelEl.innerHTML = `<div class="lv">${lv.level}</div><div class="xp"><span>Level ${lv.level} · ${fmt(lv.xp)} / ${fmt(need)} XP</span><div class="bar"><i style="width:${Math.min(100, (lv.xp / need) * 100)}%"></i></div></div>`;
    const v = s.garage.selected;
    const w = s.worlds.selected;
    const best = s.worlds.best(w.id);
    this.selVehicle.innerHTML = `${icon('car')}<small>RIDE</small>${v.name}`;
    this.selWorld.innerHTML = `${icon('globe')}<small>WORLD</small>${w.name}${best > 0 ? ` · <small>BEST</small>${fmt(best)} m` : ''}`;
    const m = s.missions.claimableCount;
    this.missionsBadge.textContent = String(m);
    this.missionsBadge.style.display = m > 0 ? '' : 'none';
    this.dailyBadge.style.display = s.daily.canClaim() ? '' : 'none';
    this.currency.refresh(false);
    void qs;
  }

  onShow(): void {
    this.refresh();
  }
}
