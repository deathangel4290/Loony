import { COSMETIC_SLOTS, COSMETICS } from '../../data/cosmetics';
import type { CosmeticDef, CosmeticSlot, UpgradeId } from '../../data/types';
import { displayStats, MAX_UPGRADE_LEVEL, UPGRADES, applyUpgrades } from '../../data/upgrades';
import { resolveLook } from '../../render/VehicleRenderer';
import { fmt, h } from '../dom';
import { icon } from '../icons';
import { renderWheelSwatch, VehiclePreview } from '../previews';
import type { Screen } from '../UIManager';
import type { UIContext } from '../types';
import { currencyBar, header, STAT_LABELS } from '../widgets';
import { shade } from '../../render/color';

const COS_ICONS: Record<string, string> = {
  none: 'close', stripes: 'distance', number: 'star', flames: 'combo', bolt: 'bolt', checker: 'flag', eyes: 'eye',
  sparkle: 'sparkle', smoke: 'air', rainbow: 'sparkle', hearts: 'heart', puff: 'air', flame: 'combo', blue: 'combo', bubbles: 'air',
  spoiler: 'car', flag: 'flag', lights: 'bolt', duck: 'heart', crown: 'trophy',
};

export class GarageScreen implements Screen {
  el = h('div', 'dim');
  private preview: VehiclePreview;
  private canvas: HTMLCanvasElement;
  private info: HTMLElement;
  private stats: HTMLElement;
  private list: HTMLElement;
  private tabUp: HTMLButtonElement;
  private tabCos: HTMLButtonElement;
  private mode: 'upgrades' | 'customize' = 'upgrades';
  private slot: CosmeticSlot = 'paint';
  private currency;
  /** Highlight a specific upgrade (tutorial). */
  private highlight: UpgradeId | null = null;

  constructor(private c: UIContext) {
    this.currency = currencyBar(c.services);
    const headRight = h('div', 'currency-bar');
    const play = h('button', 'btn small green', `${icon('play')} DRIVE`);
    play.addEventListener('click', () => c.app.startRun());
    headRight.append(this.currency.el, play);
    this.el.append(header('GARAGE', () => c.app.goMenu(), headRight));
    const body = h('div', 'garage-body');
    const left = h('div', 'panel preview-panel');
    this.canvas = h('canvas', 'preview-canvas');
    this.preview = new VehiclePreview(this.canvas);
    this.info = h('div');
    this.stats = h('div');
    left.append(this.canvas, this.info, this.stats);

    const right = h('div', 'panel right-panel');
    const tabs = h('div', 'tabs');
    this.tabUp = h('button', 'tab active', 'UPGRADES');
    this.tabCos = h('button', 'tab', 'CUSTOMIZE');
    this.tabUp.addEventListener('click', () => this.setMode('upgrades'));
    this.tabCos.addEventListener('click', () => this.setMode('customize'));
    tabs.append(this.tabUp, this.tabCos);
    this.list = h('div', 'upgrade-list scroll');
    right.append(tabs, this.list);
    body.append(left, right);
    this.el.append(body);
    c.services.events.on('currency', () => {
      this.currency.refresh();
      if (this.c.ui.current === 'garage') this.renderList();
    });
  }

  private setMode(m: 'upgrades' | 'customize'): void {
    this.mode = m;
    this.tabUp.classList.toggle('active', m === 'upgrades');
    this.tabCos.classList.toggle('active', m === 'customize');
    this.renderList();
  }

  onShow(params?: unknown): void {
    const p = params as { highlight?: UpgradeId } | undefined;
    this.highlight = p?.highlight ?? null;
    if (this.highlight) this.setMode('upgrades');
    this.refreshVehicle();
    this.renderList();
    this.currency.refresh(false);
  }

  private refreshVehicle(): void {
    const s = this.c.services;
    const v = s.garage.selected;
    this.preview.set(v, resolveLook(v, s.garage.loadout(v.id)));
    this.info.innerHTML = `<div class="vehicle-name">${v.name}</div><div class="vehicle-tag">${v.tagline}</div><div class="trait">${icon('bolt')}<b>${v.traitName}</b> ${v.traitDescription}</div>`;
    this.renderStats();
  }

  private renderStats(next?: UpgradeId): void {
    const s = this.c.services;
    const v = s.garage.selected;
    const levels = s.upgrades.levels(v.id);
    const cur = displayStats(applyUpgrades(v.physics, levels));
    let ghost: ReturnType<typeof displayStats> | null = null;
    if (next && levels[next] < MAX_UPGRADE_LEVEL) ghost = displayStats(applyUpgrades(v.physics, { ...levels, [next]: levels[next] + 1 }));
    const el = h('div', 'stats-grid');
    for (const k of Object.keys(cur) as (keyof typeof cur)[]) {
      el.append(h('span', '', STAT_LABELS[k]));
      const w = Math.round(cur[k] * 100);
      const g = ghost ? Math.round(ghost[k] * 100) - w : 0;
      el.append(h('div', 'bar', `<i style="width:${w}%"></i>${g > 0 ? `<b style="left:${w}%;width:${g}%"></b>` : ''}`));
    }
    this.stats.replaceChildren(el);
  }

  private renderList(): void {
    if (this.mode === 'upgrades') this.renderUpgrades();
    else this.renderCosmetics();
  }

  private renderUpgrades(): void {
    const s = this.c.services;
    const v = s.garage.selected;
    const frag = document.createDocumentFragment();
    for (const u of UPGRADES) {
      const lvl = s.upgrades.level(v.id, u.id);
      const maxed = lvl >= MAX_UPGRADE_LEVEL;
      const cost = s.upgrades.cost(v.id, u.id);
      const row = h('div', 'upgrade-row');
      row.dataset.id = u.id;
      const pips = Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : i === lvl ? 'next' : ''}"></i>`).join('');
      row.innerHTML = `<div class="uicon">${icon(u.icon)}</div>
        <div class="uinfo"><div class="uname">${u.name} <small>${maxed ? 'MAXED' : u.perLevelLabel}</small></div><div class="pips">${pips}</div></div>`;
      const btns = h('div');
      btns.style.display = 'flex';
      btns.style.gap = '6px';
      if (maxed) {
        btns.append(h('button', 'btn small dark disabled', 'MAX'));
      } else {
        if (s.currency.tokens > 0) {
          const tok = h('button', 'btn small blue', `${icon('token')}1`);
          tok.dataset.sfx = 'none';
          tok.addEventListener('click', () => this.buyUpgrade(u.id, true, row));
          btns.append(tok);
        }
        const afford = s.currency.canAfford(cost);
        const b = h('button', `btn small ${afford ? '' : 'disabled'}`, `${icon('coin')}${fmt(cost)}`);
        b.dataset.sfx = 'none';
        b.addEventListener('click', () => this.buyUpgrade(u.id, false, row));
        btns.append(b);
      }
      row.append(btns);
      row.addEventListener('pointerdown', () => this.renderStats(u.id));
      if (this.highlight === u.id) row.classList.add('flash');
      frag.append(row);
    }
    this.list.replaceChildren(frag);
    if (this.highlight) {
      const r = this.list.querySelector<HTMLElement>(`[data-id="${this.highlight}"] .btn:last-child`);
      r?.classList.add('play');
    }
  }

  private buyUpgrade(id: UpgradeId, token: boolean, row: HTMLElement): void {
    const s = this.c.services;
    const v = s.garage.selected;
    const res = s.upgrades.upgrade(v.id, id, token);
    if (res === 'ok') {
      s.audio.play('upgrade');
      s.haptics.success();
      this.preview.celebrate();
      this.highlight = null;
      s.achievements.check();
      if (!s.save.data.tutorial.garageIntroDone) {
        s.save.data.tutorial.garageIntroDone = true;
        s.save.markDirty();
        this.c.ui.toast({ title: 'Nice upgrade!', subtitle: 'Every level makes a real difference. Now go drive!', icon: 'wrench', tone: 'green' });
      }
      this.renderUpgrades();
      this.renderStats(id);
      const nr = this.list.querySelector<HTMLElement>(`[data-id="${id}"]`);
      nr?.classList.add('flash');
    } else {
      s.audio.play('error');
      s.haptics.warning();
      if (res === 'funds') this.c.ui.toast({ title: 'Not enough coins', subtitle: 'Drive further and flip more to earn coins!', icon: 'coin' });
      row.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 200 });
    }
  }

  private renderCosmetics(): void {
    const s = this.c.services;
    const v = s.garage.selected;
    const wrap = h('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    const tabs = h('div', 'tabs scroll-x');
    for (const sl of COSMETIC_SLOTS) {
      const t = h('button', `tab ${sl.id === this.slot ? 'active' : ''}`, sl.name);
      t.addEventListener('click', () => {
        this.slot = sl.id;
        this.renderCosmetics();
      });
      tabs.append(t);
    }
    const grid = h('div', 'cosmetic-grid');
    const loadout = s.garage.loadout(v.id);
    for (const item of COSMETICS.filter((x) => x.slot === this.slot)) {
      const owned = s.garage.ownsCosmetic(item.id);
      if (item.rewardOnly && !owned) {
        grid.append(this.cosItem(item, false, false, true));
        continue;
      }
      grid.append(this.cosItem(item, owned, loadout[item.slot] === item.id, false));
    }
    wrap.append(tabs, grid);
    this.list.replaceChildren(wrap);
  }

  private cosItem(item: CosmeticDef, owned: boolean, equipped: boolean, rewardLocked: boolean): HTMLElement {
    const s = this.c.services;
    const v = s.garage.selected;
    const el = h('div', `cos-item ${equipped ? 'equipped' : ''} ${rewardLocked ? 'locked' : ''}`);
    if (item.slot === 'paint') {
      const color = item.value === 'default' ? v.defaultPaint : item.value;
      el.append(h('div', 'swatch', ''));
      (el.lastChild as HTMLElement).style.background = `radial-gradient(circle at 35% 30%, ${shade(color, 0.35)}, ${color} 55%, ${shade(color, -0.3)})`;
    } else if (item.slot === 'wheels') {
      const cv = h('canvas');
      renderWheelSwatch(cv, item.value, shade(v.defaultPaint, 0.2));
      el.append(cv);
    } else {
      const ic = h('div', 'swatch', icon(COS_ICONS[item.value] ?? 'sparkle'));
      ic.style.display = 'flex';
      ic.style.alignItems = 'center';
      ic.style.justifyContent = 'center';
      ic.style.fontSize = '26px';
      ic.style.background = '#3a4180';
      el.append(ic);
    }
    el.append(h('div', '', item.name));
    if (equipped) el.append(h('div', 'tag', 'EQUIPPED'));
    else if (owned) el.append(h('div', 'tag', 'OWNED'));
    else if (rewardLocked) el.append(h('div', 'tag', `${icon('gift')} Reward`));
    else el.append(h('div', `price ${item.currency === 'gems' ? 'gems' : ''}`, `${icon(item.currency === 'gems' ? 'gem' : 'coin')}${fmt(item.price)}`));
    el.addEventListener('click', async () => {
      if (rewardLocked) {
        s.audio.play('error');
        this.c.ui.toast({ title: 'Reward item', subtitle: 'Earn it from daily rewards or trophies', icon: 'gift', tone: 'purple' });
        return;
      }
      if (!owned) {
        if (!s.currency.canAfford(item.price, item.currency)) {
          s.audio.play('error');
          s.haptics.warning();
          this.c.ui.toast({ title: `Not enough ${item.currency}`, icon: item.currency === 'gems' ? 'gem' : 'coin' });
          return;
        }
        const ok = await this.c.ui.confirm(`Buy ${item.name}?`, `${fmt(item.price)} ${item.currency}`, 'BUY');
        if (!ok) return;
        if (s.garage.buyCosmetic(item.id) !== 'ok') return;
        s.audio.play('purchase');
        s.haptics.success();
      } else s.audio.play('click');
      s.garage.equip(v.id, item.id);
      this.preview.set(v, resolveLook(v, s.garage.loadout(v.id)));
      this.preview.celebrate();
      this.c.app.refreshDemo();
      this.renderCosmetics();
    });
    return el;
  }

  update(dt: number): void {
    this.preview.render(dt);
  }

  onBack(): boolean {
    this.c.app.goMenu();
    return true;
  }
}
