import { DAILY_REWARDS } from '../../data/rewards';
import type { Reward } from '../../data/types';
import { fmt, h } from '../dom';
import { icon } from '../icons';
import type { UIContext } from '../types';
import { rewardText } from '../widgets';

const rewardIcon = (r: Reward): [string, string] => {
  if (r.cosmetic) return ['sparkle', 'NEW'];
  if (r.gems) return ['gem', fmt(r.gems)];
  if (r.tokens) return ['token', `x${r.tokens}`];
  return ['coin', fmt(r.coins ?? 0)];
};

/** The 7-day calendar with its claim button. */
export const dailyWidget = (c: UIContext, onClaimed?: () => void): HTMLElement => {
  const wrap = h('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '10px';
  const render = () => {
    const s = c.services;
    const states = s.daily.states();
    const grid = h('div', 'daily-grid');
    DAILY_REWARDS.forEach((d, i) => {
      const r = s.daily.rewardFor(i);
      const [ic, val] = rewardIcon(r);
      const el = h('div', `day ${states[i]} ${i === 6 ? 'big' : ''}`, `<span class="dnum">DAY ${d.day}</span><span class="dicon">${icon(ic)}</span><span class="dval">${val}</span>`);
      grid.append(el);
    });
    const can = s.daily.canClaim();
    const btn = h('button', `btn ${can ? 'pink' : 'dark disabled'}`, can ? `${icon('gift')} CLAIM DAY ${s.daily.dayIndex + 1}` : 'Come back tomorrow!');
    btn.dataset.sfx = 'none';
    btn.addEventListener('click', () => {
      const reward = s.daily.claim();
      if (!reward) return;
      s.audio.play('reward');
      s.haptics.success();
      c.ui.toast({ title: 'Daily reward!', subtitle: rewardText(reward), icon: 'gift', tone: 'purple' });
      render();
      onClaimed?.();
    });
    wrap.replaceChildren(grid, btn);
  };
  render();
  return wrap;
};
