import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/lilita-one/latin-400.css';
import './styles/main.css';
import { installPolyfills } from './core/polyfills';
import { App } from './App';

installPolyfills();

const app = new App();
(window as unknown as { __app: App }).__app = app;

app.start().then(() => {
  if (__DEBUG__) {
    const fab = document.createElement('button');
    fab.className = 'debug-fab';
    fab.textContent = 'DBG';
    fab.addEventListener('click', () => app.toggleDebug());
    document.getElementById('ui')!.append(fab);
  }
}).catch((err) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = `<div class="boot-logo">Oops!<span>Something went wrong</span></div><p style="color:#fff;max-width:70vw;text-align:center">${String(err)}</p>`;
});
