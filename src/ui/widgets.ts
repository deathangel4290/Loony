import type { Reward } from '../data/types';
import { COSMETIC_BY_ID } from '../data/cosmetics';
import type { Services } from '../systems/Services';
import { fmt, h } from './dom';
import { icon } from './icons';

export const currencyBar = (services: Services): { el: HTMLElement; refresh: (bump?: boolean) => void } => {
  const el = h('div', 'currency-bar');
  const coin = h('div', 'chip coin');
  const gem = h('div', 'chip gem');
  const token = h('div', 'chip token');
  el.append(coin, gem, token);
  let last = { c: -1, g: -1, t: -1 };
  const refresh = (bump = true) => {
    const c = services.currency.coins;
    const g = services.currency.gems;
    const t = services.currency.tokens;
    coin.innerHTML = `${icon('coin')}${fmt(c)}`;
    gem.innerHTML = `${icon('gem')}${fmt(g)}`;
    token.innerHTML = `${icon('token')}${fmt(t)}`;
    token.style.display = t > 0 ? '' : 'none';
    if (bump) {
      for (const [chip, now, prev] of [[coin, c, last.c], [gem, g, last.g], [token, t, last.t]] as const) {
        if (prev >= 0 && now !== prev) {
          chip.classList.remove('bump');
          void chip.offsetWidth;
          chip.classList.add('bump');
        }
      }
    }
    last = { c, g, t };
  };
  refresh(false);
  return { el, refresh };
};

export const rewardChips = (r: Reward): string => {
  const parts: string[] = [];
  if (r.coins) parts.push(`<span class="reward-chip coin">${icon('coin')}${fmt(r.coins)}</span>`);
  if (r.gems) parts.push(`<span class="reward-chip gem">${icon('gem')}${fmt(r.gems)}</span>`);
  if (r.tokens) parts.push(`<span class="reward-chip token">${icon('token')}${r.tokens}</span>`);
  if (r.xp) parts.push(`<span class="reward-chip xp">${icon('xp')}${fmt(r.xp)} XP</span>`);
  if (r.cosmetic) parts.push(`<span class="reward-chip cos">${icon('sparkle')}${COSMETIC_BY_ID[r.cosmetic]?.name ?? 'Cosmetic'}</span>`);
  return parts.join('');
};

export const rewardText = (r: Reward): string => {
  const parts: string[] = [];
  if (r.coins) parts.push(`${fmt(r.coins)} coins`);
  if (r.gems) parts.push(`${fmt(r.gems)} gems`);
  if (r.tokens) parts.push(`${r.tokens} upgrade token${r.tokens > 1 ? 's' : ''}`);
  if (r.xp) parts.push(`${fmt(r.xp)} XP`);
  if (r.cosmetic) parts.push(COSMETIC_BY_ID[r.cosmetic]?.name ?? 'a cosmetic');
  return parts.join(' · ');
};

export const header = (title: string, onBack: () => void, right?: HTMLElement): HTMLElement => {
  const el = h('div', 'screen-header');
  const back = h('button', 'icon-btn', icon('back'));
  back.dataset.sfx = 'back';
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', onBack);
  el.append(back, h('div', 'screen-title', title), h('div', 'spacer'));
  if (right) el.append(right);
  return el;
};

export const statRows = (stats: Record<string, number>, labels: Record<string, string>, cls = 'stats-grid'): HTMLElement => {
  const el = h('div', cls);
  for (const [k, v] of Object.entries(stats)) {
    el.append(h('span', '', labels[k] ?? k));
    const bar = h('div', 'bar', `<i style="width:${Math.round(v * 100)}%"></i>`);
    el.append(bar);
  }
  return el;
};

export const STAT_LABELS: Record<string, string> = {
  speed: 'Speed', acceleration: 'Accel', grip: 'Grip', suspension: 'Suspension', air: 'Air', fuel: 'Fuel',
};
