import { defineConfig } from 'vite';

// __DEBUG__ gates the developer tools. It is true for `vite dev` and for
// `npm run build:debug`, and false for release builds so the debug menu is
// stripped out entirely by dead-code elimination.
export default defineConfig(({ command, mode }) => ({
  base: './',
  define: {
    __DEBUG__: JSON.stringify(command === 'serve' || mode === 'debug'),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}));
