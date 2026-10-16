import { fmt, h } from '../dom';
import { icon } from '../icons';
import type { Screen } from '../UIManager';
import type { UIContext } from '../types';
import { currencyBar, header, rewardChips, rewardText } from '../widgets';
import { dailyWidget } from './daily';

export class MissionsScreen implements Screen {
  el = h('div', 'dim');
  private left = h('div', 'panel scroll');
  private right = h('div', 'panel scroll');
  private currency;

  constructor(private c: UIContext) {
    this.currency = currencyBar(c.services);
    const body = h('div', 'two-col');
    this.left.style.padding = '12px';
    this.right.style.padding = '12px';
    body.append(this.left, this.right);
    this.el.append(header('MISSIONS', () => c.app.goMenu(), this.currency.el), body);
    c.services.events.on('currency', () => this.currency.refresh());
  }

  onShow(): void {
    this.render();
    this.currency.refresh(false);
  }

  private render(): void {
    const s = this.c.services;
    s.missions.ensure();
    const title = h('div', 'screen-title', 'Active missions');
    title.style.fontSize = 'calc(var(--u) * 3.2)';
    title.style.marginBottom = '8px';
    const list = h('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';
    for (const m of s.missions.active) {
      const pct = Math.min(100, (m.progress / m.target) * 100);
      const el = h('div', `mission ${m.completed ? 'done' : ''}`);
      const isTime = m.type === 'wheelie' || m.type === 'airtime';
      const prog = isTime ? `${m.progress.toFixed(1)} / ${m.target}s` : `${fmt(m.progress)} / ${fmt(m.target)}`;
      el.innerHTML = `<div class="mtext">${m.text}</div>
        <div class="mprog"><div class="bar"><i style="width:${pct}%"></i></div><span>${prog}</span></div>
        <div class="mreward">${rewardChips(m.reward)}</div>`;
      const side = h('div', 'mside');
      if (m.completed) {
        const b = h('button', 'btn small green', `${icon('check')} CLAIM`);
        b.dataset.sfx = 'none';
        b.addEventListener('click', () => {
          const r = s.missions.claim(m.id);
          if (!r) return;
          s.audio.play('reward');
          s.haptics.success();
          this.c.ui.toast({ title: 'Mission complete!', subtitle: rewardText(r), icon: 'target', tone: 'green' });
          this.render();
        });
        side.append(b);
      } else side.append(h('div', '', icon('target')));
      el.append(side);
      list.append(el);
    }
    const foot = h('div', 'version', `Missions completed: ${fmt(s.save.data.missions.completedCount)} · New missions appear as you claim rewards`);
    this.left.replaceChildren(title, list, foot);

    const dt = h('div', 'screen-title', 'Daily rewards');
    dt.style.fontSize = 'calc(var(--u) * 3.2)';
    dt.style.marginBottom = '8px';
    this.right.replaceChildren(dt, dailyWidget(this.c));
  }

  onBack(): boolean {
    this.c.app.goMenu();
    return true;
  }
}
