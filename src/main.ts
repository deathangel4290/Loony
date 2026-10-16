import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/lilita-one/latin-400.css';
import './styles/main.css';
import { installPolyfills } from './core/polyfills';
import { Capacitor } from '@capacitor/core';
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

// Offline support for the web build (not needed inside the native app).
if ('serviceWorker' in navigator && !import.meta.env.DEV && !Capacitor.isNativePlatform() && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
