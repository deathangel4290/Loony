import type { Settings } from '../../systems/SaveData';
import { h } from '../dom';
import { icon } from '../icons';
import type { Screen } from '../UIManager';
import type { UIContext } from '../types';
import { header } from '../widgets';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

export class SettingsScreen implements Screen {
  el = h('div', 'dim');
  private grid = h('div', 'settings-grid');
  private versionTaps = 0;

  constructor(private c: UIContext) {
    const scroll = h('div', 'scroll');
    scroll.style.flex = '1';
    scroll.append(this.grid);
    this.el.append(header('SETTINGS', () => c.app.goMenu()), scroll);
  }

  onShow(): void {
    this.render();
  }

  private render(): void {
    const s = this.c.services;
    const v = s.settings.values;
    const frag = document.createDocumentFragment();

    const slider = (key: 'musicVolume' | 'sfxVolume', label: string, ic: string) => {
      const row = h('div', 'setting', `<span class="sicon">${icon(ic)}</span><span class="slabel">${label}</span>`);
      const input = h('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(v[key] * 100));
      input.addEventListener('input', () => {
        s.settings.set(key, Number(input.value) / 100);
      });
      input.addEventListener('change', () => s.audio.play('coin'));
      row.append(input);
      frag.append(row);
    };
    const toggle = (key: BoolKey, label: string, sub: string, ic: string, after?: () => void) => {
      const row = h('div', 'setting', `<span class="sicon">${icon(ic)}</span><span class="slabel">${label}<small>${sub}</small></span>`);
      const t = h('button', `toggle ${v[key] ? 'on' : ''}`);
      t.setAttribute('role', 'switch');
      t.setAttribute('aria-checked', String(v[key]));
      t.setAttribute('aria-label', label);
      t.addEventListener('click', () => {
        s.settings.set(key, !s.settings.values[key]);
        t.classList.toggle('on', s.settings.values[key]);
        t.setAttribute('aria-checked', String(s.settings.values[key]));
        if (key === 'haptics' && s.settings.values.haptics) s.haptics.medium();
        after?.();
      });
      row.append(t);
      frag.append(row);
    };

    slider('musicVolume', 'Music', 'music');
    slider('sfxVolume', 'Sound effects', 'sound');
    toggle('haptics', 'Haptics', 'Vibration feedback', 'vibrate');

    const q = h('div', 'setting', `<span class="sicon">${icon('sparkle')}</span><span class="slabel">Graphics<small>Lower = smoother on older phones</small></span>`);
    const seg = h('div', 'seg');
    for (const level of ['low', 'medium', 'high'] as const) {
      const b = h('button', v.quality === level ? 'on' : '', level[0].toUpperCase() + level.slice(1));
      b.addEventListener('click', () => {
        s.settings.set('quality', level);
        this.c.app.refreshDemo();
        this.render();
      });
      seg.append(b);
    }
    q.append(seg);
    frag.append(q);

    toggle('batterySaver', 'Battery saver', '30 FPS & lower resolution', 'bolt', () => this.c.app.refreshDemo());
    toggle('controlsSwapped', 'Swap pedals', 'Gas on the left, brake on the right', 'spin');
    toggle('highContrast', 'High contrast UI', 'Stronger outlines and text', 'eye');
    toggle('reducedShake', 'Reduce camera shake', 'Calmer impacts and crashes', 'shield');
    toggle('reducedEffects', 'Reduce effects', 'Fewer particles, no flashes', 'sparkle', () => this.c.app.refreshDemo());
    toggle('showFps', 'Show FPS', 'Performance counter', 'distance');

    const reset = h('div', 'setting', `<span class="sicon">${icon('retry')}</span><span class="slabel">Reset progress<small>Deletes all coins, unlocks and records</small></span>`);
    const rb = h('button', 'btn small pink', 'RESET');
    rb.addEventListener('click', async () => {
      const a = await this.c.ui.confirm('Reset progress?', 'Your coins, vehicles, upgrades and records will be erased.', 'RESET', 'Cancel', true);
      if (!a) return;
      const b = await this.c.ui.confirm('Are you sure?', 'This cannot be undone.', 'ERASE EVERYTHING', 'Keep my progress', true);
      if (!b) return;
      await this.c.app.resetProgress();
    });
    reset.append(rb);
    frag.append(reset);

    this.grid.replaceChildren(frag);
    const ver = h('div', 'version', `Loony Wheels v${__APP_VERSION__} · Made with care · Works fully offline`);
    ver.addEventListener('click', () => {
      if (!__DEBUG__) return;
      if (++this.versionTaps >= 5) {
        this.versionTaps = 0;
        this.c.app.toggleDebug();
      }
    });
    this.grid.append(ver);
    ver.style.gridColumn = '1 / -1';
  }

  onBack(): boolean {
    this.c.app.goMenu();
    return true;
  }
}
