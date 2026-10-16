import { ACHIEVEMENTS } from '../../data/achievements';
import { fmt, h } from '../dom';
import { icon, hasIcon } from '../icons';
import type { Screen } from '../UIManager';
import type { UIContext } from '../types';
import { header, rewardChips } from '../widgets';

export class AchievementsScreen implements Screen {
  el = h('div', 'dim');
  private grid = h('div', 'ach-grid');
  private count = h('div', 'chip');

  constructor(private c: UIContext) {
    const scroll = h('div', 'scroll');
    scroll.style.flex = '1';
    scroll.append(this.grid);
    this.el.append(header('TROPHIES', () => c.app.goMenu(), this.count), scroll);
  }

  onShow(): void {
    const s = this.c.services;
    this.count.innerHTML = `${icon('trophy')} ${s.achievements.unlockedCount} / ${ACHIEVEMENTS.length}`;
    const frag = document.createDocumentFragment();
    const sorted = [...ACHIEVEMENTS].sort((a, b) => Number(s.achievements.isUnlocked(b.id)) - Number(s.achievements.isUnlocked(a.id)));
    for (const a of sorted) {
      const done = s.achievements.isUnlocked(a.id);
      const p = s.achievements.progress(a);
      const cur = a.stat === 'special' ? 0 : Math.min(a.goal, s.save.data.stats[a.stat] ?? 0);
      const el = h('div', `ach ${done ? 'unlocked' : ''}`);
      el.innerHTML = `<div class="aicon">${icon(hasIcon(a.icon) ? a.icon : 'trophy')}</div>
        <div class="aname">${a.name}</div>
        <div class="adesc">${a.description} ${done ? '' : `<small>(${fmt(cur)} / ${fmt(a.goal)})</small>`}</div>
        <div style="display:flex;gap:8px;align-items:center"><div class="bar" style="flex:1"><i style="width:${p * 100}%"></i></div><span style="display:flex;gap:4px">${rewardChips(a.reward)}</span></div>`;
      frag.append(el);
    }
    this.grid.replaceChildren(frag);
  }

  onBack(): boolean {
    this.c.app.goMenu();
    return true;
  }
}
