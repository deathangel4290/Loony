import { h } from '../dom';
import type { Screen } from '../UIManager';

/** First-launch title card: one tap and you're driving. */
export class TitleScreen implements Screen {
  el = h('div', 'title-screen', `<div class="logo">LOONY<span>WHEELS</span></div><div class="tap-start">TAP TO START</div>`);
  constructor(onStart: () => void) {
    this.el.addEventListener('pointerup', () => onStart());
  }
}
