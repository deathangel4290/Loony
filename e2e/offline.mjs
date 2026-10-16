// Verifies the web build keeps working offline once loaded (service worker).
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } });
const page = await ctx.newPage();
await page.goto(process.argv[2] ?? 'http://localhost:4173/');
await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready, null, { timeout: 15000 });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.waitForFunction(() => window.__app?.debugState?.screen, null, { timeout: 15000 });
console.log('offline reload ok, screen =', await page.evaluate(() => window.__app.debugState.screen));
await browser.close();
