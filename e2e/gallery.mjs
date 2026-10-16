// Visual gallery: drives each world with a different vehicle and screenshots it.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const pairs = [['hills', 'scrambler'], ['desert', 'thunder'], ['snow', 'comet'], ['city', 'vortex'], ['volcano', 'brutus'], ['hills', 'nova']];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base);
await page.waitForTimeout(1500);
for (const [w, v] of pairs) {
  await page.evaluate(([w, v]) => {
    const s = window.__app.services;
    const d = s.save.data;
    d.tutorial.completed = true;
    d.tutorial.garageIntroDone = true;
    s.garage.grantVehicle(v);
    s.worlds.grant(w);
    s.garage.select(v);
    s.worlds.select(w);
    document.querySelectorAll('.modal [data-close]').forEach((b) => b.click());
    window.__app.startRun();
  }, [w, v]);
  await page.waitForTimeout(700);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(Number(process.env.T ?? 5000));
  await page.screenshot({ path: `${out}gallery-${w}-${v}.png` });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}gallery-${w}-${v}-b.png` });
  await page.keyboard.up('ArrowRight');
}
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'gallery ok');
await browser.close();
