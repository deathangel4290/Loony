// Lifecycle QA: backgrounding, save persistence, out-of-fuel, purchases via UI.
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) errors.push(name); };
const state = () => page.evaluate(() => { const a = window.__app.debugState; return { mode: a.mode, paused: a.paused, screen: a.screen, session: a.view?.session.state, dist: a.view?.session.distance }; });
const ready = async () => { await page.waitForFunction(() => window.__app?.debugState?.screen, null, { timeout: 15000 }); await page.waitForTimeout(500); };

await page.goto(base);
await ready();
check('first launch shows title', (await state()).screen === 'title');
await page.touchscreen.tap(400, 200);
await page.waitForTimeout(900);
check('tap starts tutorial run', (await state()).mode === 'game');

// Backgrounding pauses the run
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(1500);
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(300);
const d1 = (await state()).dist;
await page.waitForTimeout(800);
let s = await state();
check('backgrounding pauses', s.paused && Math.abs(s.dist - d1) < 0.01, JSON.stringify(s));
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await page.keyboard.up('ArrowRight');
check('stays paused after returning (player resumes)', (await state()).paused);
await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => b.textContent.includes('RESUME')).click());
await page.waitForTimeout(300);
check('resume works', !(await state()).paused);

// Out of fuel ends the run with the fuel reason
await page.evaluate(() => { const p = window.__app.debugState.view.session.player; p.fuel = 0.2; });
await page.waitForFunction(() => window.__app.debugState.screen === 'results', null, { timeout: 15000 });
const title = await page.textContent('.results-title');
check('out of fuel -> results', /FUEL/.test(title ?? ''), title);
const coins = await page.evaluate(() => window.__app.services.currency.coins);

// Save persists across reload
await page.evaluate(() => window.__app.services.save.flush());
await page.reload();
await ready();
s = await state();
check('returning player lands on menu', s.screen === 'menu', JSON.stringify(s));
const coins2 = await page.evaluate(() => window.__app.services.currency.coins);
check('coins persisted', coins2 === coins && coins > 0, `${coins} -> ${coins2}`);

// Buy an upgrade through the garage UI
await page.evaluate(() => { document.querySelectorAll('.modal [data-close]').forEach((b) => b.click()); window.__app.services.currency.add('coins', 5000); window.__app.open('garage'); });
await page.waitForTimeout(700);
const before = await page.evaluate(() => window.__app.services.upgrades.level('pip', 'engine'));
await page.click('.upgrade-row[data-id="engine"] .btn:last-child');
await page.waitForTimeout(300);
const after = await page.evaluate(() => window.__app.services.upgrades.level('pip', 'engine'));
check('upgrade via UI', after === before + 1, `${before} -> ${after}`);

// Buy a vehicle through the vehicles UI (meets level via XP)
await page.evaluate(() => { window.__app.services.progression.addXp(2000); window.__app.open('vehicles'); });
await page.waitForTimeout(700);
await page.evaluate(() => [...document.querySelectorAll('.card')][1].querySelector('.btn').click());
await page.waitForTimeout(400);
await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => b.textContent.includes('BUY')).click());
await page.waitForTimeout(400);
const owned = await page.evaluate(() => ({ own: window.__app.services.garage.owns('scrambler'), sel: window.__app.services.garage.selected.id }));
check('buy + select vehicle via UI', owned.own && owned.sel === 'scrambler', JSON.stringify(owned));

// Settings toggle persists
await page.evaluate(() => window.__app.open('settings'));
await page.waitForTimeout(500);
await page.click('.setting:has-text("Swap pedals") .toggle');
await page.evaluate(() => window.__app.services.save.flush());
await page.reload();
await ready();
check('setting persisted', await page.evaluate(() => window.__app.services.settings.values.controlsSwapped));

// Restart from results
await page.evaluate(() => { document.querySelectorAll('.modal [data-close]').forEach((b) => b.click()); window.__app.startRun(); });
await page.waitForTimeout(800);
await page.evaluate(() => window.__app.debugState.view.session.player.end('crash'));
await page.waitForFunction(() => window.__app.debugState.screen === 'results', null, { timeout: 15000 });
await page.evaluate(() => [...document.querySelectorAll('.results button')].find((b) => b.textContent.includes('RETRY')).click());
await page.waitForTimeout(900);
s = await state();
check('retry starts a fresh run', s.mode === 'game' && s.session === 'running' && s.dist < 5, JSON.stringify(s));

await browser.close();
if (errors.length) { console.log('FAILURES/ERRORS:', errors); process.exit(1); }
console.log('qa ok');
