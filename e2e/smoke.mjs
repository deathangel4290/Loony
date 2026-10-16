// Smoke test: boots the built game in mobile Chromium, plays the first-run
// flow with real input, and checks for runtime errors. Screenshots go to
// e2e/out/. Usage: node e2e/smoke.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const devices = [
  { name: 'iphone15', width: 852, height: 393, dpr: 3 },
  { name: 'iphoneSE', width: 667, height: 375, dpr: 2 },
];
const only = process.env.DEVICE;
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
for (const d of devices.filter((x) => !only || x.name === only)) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${d.name}] console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${d.name}] pageerror: ${e.message}\n${e.stack}`));
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById('boot') === null || document.getElementById('boot').classList.contains('hidden'), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const shot = (n) => page.screenshot({ path: `${out}${d.name}-${n}.png` });
  await shot('01-title');
  await page.touchscreen.tap(d.width / 2, d.height / 2);
  await page.waitForTimeout(900);
  await shot('02-run-start');
  // hold gas with the keyboard (touch input is exercised separately)
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1500);
    await shot(`03-drive-${i}`);
  }
  await page.keyboard.up('ArrowRight');
  // touch: tap the brake half for a bit
  await page.touchscreen.tap(d.width * 0.15, d.height * 0.8);
  const state = await page.evaluate(() => {
    const a = window.__app.debugState;
    return { mode: a.mode, screen: a.screen, dist: a.view?.session.distance, fps: a.fps, state: a.view?.session.state };
  });
  console.log(d.name, JSON.stringify(state));
  // end the run quickly: pause -> quit
  await page.evaluate(() => window.__app.pause());
  await page.waitForTimeout(400);
  await shot('04-pause');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.modal button')].find((b) => b.textContent.includes('QUIT'));
    btn?.click();
  });
  await page.waitForTimeout(2600);
  await shot('05-results');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.results button')].find((b) => /UPGRADE|GARAGE/.test(b.textContent));
    btn?.click();
  });
  await page.waitForTimeout(1200);
  await shot('06-garage');
  await page.evaluate(() => window.__app.goMenu());
  await page.waitForTimeout(1200);
  await shot('07-menu');
  for (const s of ['vehicles', 'worlds', 'missions', 'achievements', 'settings']) {
    await page.evaluate((x) => {
      document.querySelectorAll('.modal [data-close]').forEach((b) => b.click());
      window.__app.open(x);
    }, s);
    await page.waitForTimeout(900);
    await shot(`08-${s}`);
  }
  await ctx.close();
}
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok');
