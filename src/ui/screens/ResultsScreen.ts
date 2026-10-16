import { xpForNextLevel } from '../../data/rewards';
import { VEHICLES } from '../../data/vehicles';
import { WORLDS } from '../../data/worlds';
import { endReasonText } from '../../systems/RunSummary';
import type { RunRewards } from '../../systems/Services';
import { countUp, fmt, h, wait } from '../dom';
import { icon } from '../icons';
import type { Screen } from '../UIManager';
import type { UIContext } from '../types';
import { rewardText } from '../widgets';

/** End-of-run summary with staged count-ups and progress bars. */
export class ResultsScreen implements Screen {
  el = h('div', 'results');
  private token = 0;
  private cancels: (() => void)[] = [];

  constructor(private c: UIContext) {}

  onShow(params?: unknown): void {
    const r = params as RunRewards;
    this.token++;
    this.cancels.forEach((f) => f());
    this.cancels = [];
    void this.build(r, this.token);
  }

  onHide(): void {
    this.token++;
    this.cancels.forEach((f) => f());
  }

  private async build(r: RunRewards, token: number): Promise<void> {
    const s = this.c.services;
    const sum = r.summary;
    const wrap = h('div', 'results-wrap');
    const head = h('div', 'results-head');
    const title = h('div', `results-title ${sum.endReason === 'fuel' ? 'fuel' : ''}`, endReasonText[sum.endReason]);
    head.append(title);
    if (r.newBest) head.append(h('div', 'new-best', `${icon('star')} NEW BEST DISTANCE!`));

    const stats = h('div', 'panel res-stats');
    const rows: { label: string; value: number; suffix?: string; cls?: string }[] = [
      { label: 'Distance', value: sum.distance, suffix: ' m' },
      { label: 'Best distance', value: Math.max(sum.distance, r.previousBest), suffix: ' m' },
      { label: 'Tricks', value: sum.tricks },
      { label: 'Score', value: sum.score },
      { label: 'Coins collected', value: sum.coinsCollected },
      { label: 'Trick bonus', value: sum.trickCoins },
      { label: 'Distance bonus', value: sum.distanceCoins },
      { label: 'Coins earned', value: sum.coinsEarned, cls: 'total' },
    ];
    const valueEls: HTMLElement[] = [];
    for (const row of rows) {
      const el = h('div', `res-row ${row.cls ?? ''}`, `<span>${row.label}</span>`);
      const b = h('b', '', '0');
      if (row.cls === 'total') b.innerHTML = `0`;
      el.append(b);
      stats.append(el);
      valueEls.push(b);
    }

    const side = h('div', 'res-side');
    const xpBox = h('div', 'panel res-box');
    const before = r.xpBefore;
    xpBox.innerHTML = `<h4><span>LEVEL <b class="lvl">${before.level}</b></span><span>+${fmt(sum.xpEarned)} XP</span></h4><div class="bar"><i style="width:${(before.xp / before.needed) * 100}%"></i></div>`;
    side.append(xpBox);

    // Next unlock progress
    const nextV = VEHICLES.find((v) => !s.garage.owns(v.id));
    const nextW = WORLDS.find((w) => !s.worlds.isUnlocked(w.id));
    const target = [nextV && { name: nextV.name, price: nextV.price, level: nextV.requiredLevel }, nextW && { name: nextW.name, price: nextW.price, level: nextW.requiredLevel }]
      .filter((x): x is { name: string; price: number; level: number } => !!x)
      .sort((a, b) => a.price - b.price)[0];
    if (target) {
      const coins = s.currency.coins;
      const pct = Math.min(100, (coins / target.price) * 100);
      const box = h('div', 'panel res-box unlock', `<h4><span>${icon('lock')} ${target.name}</span><span>${fmt(Math.min(coins, target.price))} / ${fmt(target.price)}</span></h4><div class="bar"><i style="width:0%"></i></div>`);
      if (s.save.data.level < target.level) box.append(h('div', 'card-sub', `Unlocks at level ${target.level}`));
      side.append(box);
      setTimeout(() => {
        const i = box.querySelector<HTMLElement>('.bar > i');
        if (i) i.style.width = `${pct}%`;
      }, 900);
    }

    if (r.challenge) {
      const ch = r.challenge;
      const pct = Math.min(100, (ch.best / ch.challenge.target) * 100);
      const box = h('div', 'panel res-box challenge', `<h4><span>${icon('flag')} Daily challenge</span><span>${fmt(ch.best)} / ${fmt(ch.challenge.target)} m</span></h4><div class="bar"><i style="width:0%"></i></div>`);
      if (ch.completedNow) box.append(h('div', 'res-mission', `${icon('check')} Goal reached! ${rewardText(ch.challenge.reward)}`));
      else if (ch.completed) box.append(h('div', 'res-mission', `${icon('check')} Completed today`));
      else box.append(h('div', 'card-sub', `${fmt(ch.challenge.target - ch.best)} m to go — try again!`));
      side.prepend(box);
      setTimeout(() => {
        const i = box.querySelector<HTMLElement>('.bar > i');
        if (i) i.style.width = `${pct}%`;
      }, 700);
      if (ch.completedNow) setTimeout(() => s.audio.play('achievement'), 900);
    }

    if (r.missionsCompleted.length || r.achievements.length) {
      const box = h('div', 'panel res-box');
      box.append(h('h4', '', `<span>${icon('target')} Completed</span>`));
      for (const m of r.missionsCompleted) box.append(h('div', 'res-mission', `${icon('check')} ${m.text}`));
      for (const a of r.achievements) box.append(h('div', 'res-mission', `${icon('trophy')} ${a.name} — ${rewardText(a.reward)}`));
      side.append(box);
    }

    // First-run nudge towards the garage.
    const firstUpgrade = !s.save.data.tutorial.garageIntroDone && s.currency.coins >= s.upgrades.cost(s.garage.selected.id, 'engine');
    const actions = h('div', 'res-actions');
    const retry = h('button', `btn big ${firstUpgrade ? 'dark' : ''}`, `${icon('retry')} RETRY`);
    const garage = h('button', `btn ${firstUpgrade ? 'big green play' : 'blue'}`, `${icon('wrench')} ${firstUpgrade ? 'UPGRADE!' : 'GARAGE'}`);
    const home = h('button', 'btn dark', `${icon('home')}`);
    home.setAttribute('aria-label', 'Home');
    retry.addEventListener('click', () => this.c.app.restart());
    garage.addEventListener('click', () => this.c.app.quitRun('garage'));
    home.addEventListener('click', () => this.c.app.quitRun('menu'));
    actions.append(home, garage, retry);

    wrap.append(head, stats, side, actions);
    this.el.replaceChildren(wrap);

    // Staged reveal
    await wait(350);
    const rowsEls = Array.from(stats.querySelectorAll<HTMLElement>('.res-row'));
    for (let i = 0; i < rows.length; i++) {
      if (token !== this.token) return;
      rowsEls[i].classList.add('in');
      const row = rows[i];
      const el = valueEls[i];
      if (row.cls === 'total') {
        this.cancels.push(countUp(el, 0, row.value, 700, '', () => s.audio.play('tick', 4)));
      } else this.cancels.push(countUp(el, 0, row.value, 380, row.suffix ?? '', () => undefined));
      s.audio.play('tick', i);
      await wait(row.cls === 'total' ? 700 : 110);
    }
    if (token !== this.token) return;
    if (sum.coinsEarned > 0) s.audio.play('coinBig');

    // XP bar, including level-ups
    const bar = xpBox.querySelector<HTMLElement>('.bar > i')!;
    const lvlEl = xpBox.querySelector<HTMLElement>('.lvl')!;
    for (const lv of r.levelsGained) {
      bar.style.width = '100%';
      await wait(550);
      if (token !== this.token) return;
      lvlEl.textContent = String(lv);
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth;
      bar.style.transition = '';
      s.audio.play('levelUp');
      s.haptics.success();
    }
    bar.style.width = `${Math.min(100, (r.xpAfter.xp / xpForNextLevel(r.xpAfter.level)) * 100)}%`;
  }

  onBack(): boolean {
    this.c.app.quitRun('menu');
    return true;
  }
}
