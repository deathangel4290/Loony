// Frame-time profile under CPU throttling. Usage: node e2e/perf.mjs [world] [vehicle] [quality] [throttle]
import { chromium } from 'playwright';
const [world = 'city', vehicle = 'vortex', quality = 'high', throttle = '4'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: Number(process.env.DPR ?? 3), isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(process.env.URL ?? 'http://localhost:4173/');
await page.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(page);
await page.evaluate(([w, v, q]) => {
  const s = window.__app.services;
  s.save.data.tutorial.completed = true;
  s.save.data.tutorial.garageIntroDone = true;
  s.garage.grantVehicle(v); s.worlds.grant(w); s.garage.select(v); s.worlds.select(w);
  s.settings.set('quality', q);
  window.__app.startRun();
}, [world, vehicle, quality]);
await page.waitForTimeout(800);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(throttle) });
await page.keyboard.down('ArrowRight');
const samples = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1500);
  samples.push(await page.evaluate(() => { const d = window.__app.debugState; return { fps: d.fps, ...d.perf, fx: d.view?.particles.count, dist: Math.round(d.view?.session.distance ?? 0) }; }));
}
const avg = (k) => (samples.reduce((a, s) => a + s[k], 0) / samples.length).toFixed(2);
console.log(`${world}/${vehicle}/${quality} x${throttle}: fps ${avg('fps')} sim ${avg('update')}ms draw ${avg('render')}ms worst ${Math.max(...samples.map((s) => s.worst)).toFixed(1)}ms dist ${samples.at(-1).dist}`);
await browser.close();
