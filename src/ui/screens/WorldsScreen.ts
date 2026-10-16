import { WORLDS } from '../../data/worlds';
import type { WorldDef } from '../../data/types';
import { fmt, h } from '../dom';
import { icon } from '../icons';
import { renderWorldThumb } from '../previews';
import type { Screen } from '../UIManager';
import type { UIContext } from '../types';
import { currencyBar, header } from '../widgets';

export class WorldsScreen implements Screen {
  el = h('div', 'dim');
  private carousel = h('div', 'carousel scroll-x');
  private currency;

  constructor(private c: UIContext) {
    this.currency = currencyBar(c.services);
    this.el.append(header('WORLDS', () => c.app.goMenu(), this.currency.el), this.carousel);
    c.services.events.on('currency', () => this.currency.refresh());
  }

  onShow(): void {
    this.render();
    this.currency.refresh(false);
  }

  private render(): void {
    const s = this.c.services;
    const frag = document.createDocumentFragment();
    const thumbs: [HTMLCanvasElement, WorldDef][] = [];
    for (const w of WORLDS) {
      const unlocked = s.worlds.isUnlocked(w.id);
      const selected = s.worlds.selected.id === w.id;
      const card = h('div', `card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`);
      const art = h('div', 'card-art');
      const cv = h('canvas');
      art.append(cv);
      thumbs.push([cv, w]);
      const status = s.worlds.canUnlock(w);
      if (!unlocked) art.append(h('div', 'lock-label', status === 'level' ? `${icon('lock')} Level ${w.requiredLevel}` : `${icon('lock')} Locked`));
      const best = s.worlds.best(w.id);
      const body = h('div', 'card-body');
      body.innerHTML = `<div class="card-title">${w.name}</div><div class="card-sub">${w.tagline}</div>
        <div class="best-line">${icon('flag')} Best <b>${best > 0 ? fmt(best) + ' m' : '—'}</b></div>
        <div class="best-line">${icon('coin')} Coin bonus <b>x${w.coinMultiplier}</b></div>`;
      const foot = h('div', 'card-foot');
      let btn: HTMLButtonElement;
      if (unlocked) btn = h('button', 'btn small green', `${icon('play')} PLAY`);
      else if (status === 'level') btn = h('button', 'btn small dark disabled', `${icon('lock')} LV ${w.requiredLevel} · ${icon('coin')}${fmt(w.price)}`);
      else btn = h('button', `btn small ${status === 'ok' ? '' : 'disabled'}`, `${icon('coin')}${fmt(w.price)}`);
      btn.dataset.sfx = 'none';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.act(w, true);
      });
      card.addEventListener('click', () => void this.act(w, false));
      foot.append(btn);
      body.append(foot);
      card.append(art, body);
      frag.append(card);
    }
    this.carousel.replaceChildren(frag);
    requestAnimationFrame(() => {
      for (const [cv, w] of thumbs) renderWorldThumb(cv, w);
    });
  }

  private async act(w: WorldDef, play: boolean): Promise<void> {
    const s = this.c.services;
    if (s.worlds.isUnlocked(w.id)) {
      const changed = s.worlds.selected.id !== w.id;
      s.worlds.select(w.id);
      if (changed) {
        s.audio.play('click');
        s.haptics.select();
        this.c.app.refreshDemo();
      }
      if (play) this.c.app.startRun();
      else this.render();
      return;
    }
    if (!play) return;
    const status = s.worlds.canUnlock(w);
    if (status === 'level') {
      s.audio.play('error');
      this.c.ui.toast({ title: `Reach level ${w.requiredLevel}`, subtitle: 'Earn XP by driving and doing tricks', icon: 'lock' });
      return;
    }
    if (status === 'funds') {
      s.audio.play('error');
      s.haptics.warning();
      this.c.ui.toast({ title: 'Not enough coins', subtitle: `${fmt(w.price - s.currency.coins)} more to go!`, icon: 'coin' });
      return;
    }
    const ok = await this.c.ui.confirm(`Unlock ${w.name}?`, `${w.tagline}<br><br><b>${fmt(w.price)} coins</b>`, 'UNLOCK');
    if (!ok) return;
    if (s.worlds.unlock(w.id) === 'ok') {
      s.worlds.select(w.id);
      s.audio.play('levelUp');
      s.haptics.success();
      this.c.ui.toast({ title: `${w.name} unlocked!`, subtitle: 'New terrain, new music, new coins', icon: 'globe', tone: 'green' });
      this.c.app.refreshDemo();
      this.render();
    }
  }

  onBack(): boolean {
    this.c.app.goMenu();
    return true;
  }
}
