import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Emits sw.js with a precache list of every built file so the web/PWA
 * version (e.g. GitHub Pages added to the home screen) plays offline.
 */
const serviceWorker = (): Plugin => ({
  name: 'loony-service-worker',
  apply: 'build',
  generateBundle(_opts, bundle) {
    const files = ['./', './index.html', ...Object.keys(bundle).filter((f) => !f.endsWith('.map')).map((f) => `./${f}`)];
    for (const f of ['manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png']) files.push(`./${f}`);
    const version = Date.now().toString(36);
    const src = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8')
      .replace("'loony-__VERSION__'", `'loony-${version}'`)
      .replace('const PRECACHE = __PRECACHE__;', `const PRECACHE = ${JSON.stringify(Array.from(new Set(files)))};`);
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
  },
});

// __DEBUG__ gates the developer tools. It is true for `vite dev` and for
// `npm run build:debug`, and false for release builds so the debug menu is
// stripped out entirely by dead-code elimination.
export default defineConfig(({ command, mode }) => ({
  base: './',
  define: {
    __DEBUG__: JSON.stringify(command === 'serve' || mode === 'debug'),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },
  plugins: [serviceWorker()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}));
