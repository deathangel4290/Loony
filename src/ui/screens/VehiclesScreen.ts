import { displayStats, applyUpgrades } from '../../data/upgrades';
import { VEHICLES } from '../../data/vehicles';
import type { VehicleDef } from '../../data/types';
import { resolveLook } from '../../render/VehicleRenderer';
import { fmt, h } from '../dom';
import { icon } from '../icons';
import { renderVehicleThumb } from '../previews';
import type { Screen } from '../UIManager';
import type { UIContext } from '../types';
import { currencyBar, header, statRows, STAT_LABELS } from '../widgets';

export class VehiclesScreen implements Screen {
  el = h('div', 'dim');
  private carousel = h('div', 'carousel scroll-x');
  private currency;

  constructor(private c: UIContext) {
    this.currency = currencyBar(c.services);
    this.el.append(header('VEHICLES', () => c.app.goMenu(), this.currency.el), this.carousel);
    c.services.events.on('currency', () => this.currency.refresh());
  }

  onShow(): void {
    this.render();
    this.currency.refresh(false);
    const sel = this.carousel.querySelector<HTMLElement>('.card.selected');
    sel?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  private render(): void {
    const s = this.c.services;
    const frag = document.createDocumentFragment();
    const thumbs: [HTMLCanvasElement, VehicleDef][] = [];
    for (const v of VEHICLES) {
      const owned = s.garage.owns(v.id);
      const selected = s.garage.selected.id === v.id;
      const card = h('div', `card ${selected ? 'selected' : ''} ${owned ? '' : 'locked'}`);
      const art = h('div', 'card-art');
      const cv = h('canvas');
      art.append(cv);
      thumbs.push([cv, v]);
      const status = s.garage.canBuy(v);
      if (!owned) art.append(h('div', 'lock-label', status === 'level' ? `${icon('lock')} Level ${v.requiredLevel}` : `${icon('lock')} Locked`));
      const body = h('div', 'card-body');
      body.innerHTML = `<div class="card-title">${v.name}</div><div class="card-sub">${v.tagline}</div><div class="trait">${icon('bolt')}<b>${v.traitName}</b></div>`;
      const st = displayStats(owned ? applyUpgrades(v.physics, s.upgrades.levels(v.id)) : v.physics);
      body.append(statRows({ speed: st.speed, acceleration: st.acceleration, grip: st.grip, air: st.air }, STAT_LABELS, 'mini-stats'));
      const foot = h('div', 'card-foot');
      let btn: HTMLButtonElement;
      if (selected) btn = h('button', 'btn small green', `${icon('check')} SELECTED`);
      else if (owned) btn = h('button', 'btn small blue', 'SELECT');
      else if (status === 'level') btn = h('button', 'btn small dark disabled', `${icon('lock')} LV ${v.requiredLevel} · ${icon('coin')}${fmt(v.price)}`);
      else btn = h('button', `btn small ${status === 'ok' ? '' : 'disabled'}`, `${icon('coin')}${fmt(v.price)}`);
      btn.dataset.sfx = 'none';
      btn.addEventListener('click', () => this.act(v));
      foot.append(btn);
      body.append(foot);
      card.append(art, body);
      frag.append(card);
    }
    this.carousel.replaceChildren(frag);
    requestAnimationFrame(() => {
      for (const [cv, v] of thumbs) renderVehicleThumb(cv, v, resolveLook(v, s.garage.loadout(v.id)));
    });
  }

  private async act(v: VehicleDef): Promise<void> {
    const s = this.c.services;
    if (s.garage.owns(v.id)) {
      if (s.garage.selected.id !== v.id) {
        s.garage.select(v.id);
        s.audio.play('click');
        s.haptics.select();
        this.c.app.refreshDemo();
        this.render();
      }
      return;
    }
    const status = s.garage.canBuy(v);
    if (status === 'level') {
      s.audio.play('error');
      this.c.ui.toast({ title: `Reach level ${v.requiredLevel}`, subtitle: 'Earn XP by driving and doing tricks', icon: 'lock' });
      return;
    }
    if (status === 'funds') {
      s.audio.play('error');
      s.haptics.warning();
      this.c.ui.toast({ title: 'Not enough coins', subtitle: `${fmt(v.price - s.currency.coins)} more to go!`, icon: 'coin' });
      return;
    }
    const ok = await this.c.ui.confirm(`Buy ${v.name}?`, `${v.description}<br><br><b>${fmt(v.price)} coins</b>`, 'BUY');
    if (!ok) return;
    if (s.garage.buy(v.id) === 'ok') {
      s.garage.select(v.id);
      s.audio.play('levelUp');
      s.haptics.success();
      s.achievements.check();
      this.c.ui.toast({ title: `${v.name} unlocked!`, subtitle: v.traitName, icon: 'car', tone: 'green' });
      this.c.app.refreshDemo();
      this.render();
    }
  }

  onBack(): boolean {
    this.c.app.goMenu();
    return true;
  }
}
