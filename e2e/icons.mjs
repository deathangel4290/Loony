// Renders public/icon.svg to the PNG icon/splash sizes needed by iOS and the PWA.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const page = await browser.newPage();
const render = async (size, path, opts = {}) => {
  await page.setViewportSize({ width: size, height: opts.h ?? size });
  const body = opts.splash
    ? `<div style="width:100vw;height:100vh;background:#1b1f3b;display:flex;align-items:center;justify-content:center"><div style="width:${Math.round(size * 0.22)}px;height:${Math.round(size * 0.22)}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`
    : `<div style="width:${size}px;height:${size}px">${svg.replace('rx="112"', opts.square ? 'rx="0"' : 'rx="112"').replace('<svg ', '<svg width="100%" height="100%" ')}</div>`;
  await page.setContent(`<html><body style="margin:0;background:#1b1f3b">${body}</body></html>`);
  await page.screenshot({ path, omitBackground: false });
};
await render(1024, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', { square: true });
await render(512, 'public/icon-512.png');
await render(180, 'public/icon-180.png', { square: true });
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await render(2732, `ios/App/App/Assets.xcassets/Splash.imageset/${f}`, { splash: true });
}
await browser.close();
console.log('icons ok');
