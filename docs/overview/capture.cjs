// Screenshots for the overview PDF (docs/overview/README.md). Drives the LIVE site in headless
// WebKit (the iPhone/iPad engine) at phone, tablet and desktop sizes, light and dark.
// Playwright is not a dependency of this zero-dependency app: run it from a scratch folder,
//   (cd /tmp/pw && npm i playwright && npx playwright install webkit)
//   NODE_PATH=/tmp/pw/node_modules node docs/overview/capture.cjs [https://podcasts.kpfk.org]
// The usage beacon (/api/ev) is blocked, so these visits never reach the station's stats.
// Writes PNGs to docs/overview/raw/ (git-ignored); README step 2 shrinks them into img/.
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = (process.argv[2] || 'https://podcasts.kpfk.org').replace(/\/$/, '');
const OUT = path.join(__dirname, 'raw');
fs.mkdirSync(OUT, { recursive: true });
// The featured program and episode (Democracy Now!): the newest broadcast with a transcript.
const SHOW = '/show/dn';

const sizes = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: false },
  tablet: { viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

(async () => {
  const b = await webkit.launch();
  const episodePath = async page => page.evaluate(async show => {
    const r = await fetch('/api/archive').then(x => x.json());
    const eps = r.shows.filter(s => s.sho.endsWith('.' + show.split('/').pop())).sort((a, z) => z.dt - a.dt);
    return window.ShowLinks.episodePath(eps[0]);
  }, SHOW);
  const shot = async (page, name) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  ' + name); };
  const open = async (size, scheme) => {
    const ctx = await b.newContext({ ...sizes[size], colorScheme: scheme });
    await ctx.route('**/api/ev', r => r.abort());   // never count these visits
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    return { ctx, page };
  };
  const home = async page => { await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(3000); };
  const playFeatured = async page => {
    await page.goto(BASE + await episodePath(page), { waitUntil: 'load' }); await page.waitForTimeout(2500);
    await page.click('#sheetBody .sheet-play'); await page.waitForTimeout(2500);
  };

  // ---- phone ----
  let { ctx, page } = await open('phone', 'light');
  await home(page); await shot(page, 'phone-home-light');
  await playFeatured(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.click('#playerInfoBtn'); await page.waitForTimeout(1500); await shot(page, 'phone-player-light');
  await ctx.close();

  ({ ctx, page } = await open('phone', 'dark'));
  await page.goto(BASE + SHOW, { waitUntil: 'load' }); await page.waitForTimeout(3000); await shot(page, 'phone-show-dark');
  await playFeatured(page);
  await page.click('#sheetBody .sheet-along'); await page.waitForTimeout(3500);
  await page.click('#alongLarger'); await page.waitForTimeout(500); await shot(page, 'phone-transcript-dark');
  await page.click('#alongSmaller'); await page.goBack(); await page.waitForTimeout(800);
  await page.click('#onAirBtn'); await page.waitForTimeout(3000); await shot(page, 'phone-live-dark');
  await ctx.close();

  // ---- tablet ----
  ({ ctx, page } = await open('tablet', 'dark'));
  await home(page); await shot(page, 'tablet-home-dark');
  await ctx.close();
  ({ ctx, page } = await open('tablet', 'light'));
  await page.goto(BASE + '/?q=climate', { waitUntil: 'load' }); await page.waitForTimeout(3000); await shot(page, 'tablet-search-light');
  await ctx.close();

  // ---- desktop ----
  ({ ctx, page } = await open('desktop', 'light'));
  await home(page); await shot(page, 'desktop-home-light');
  await playFeatured(page);
  await page.click('#sheetBody .sheet-along'); await page.waitForTimeout(3500); await shot(page, 'desktop-transcript-light');
  await ctx.close();
  ({ ctx, page } = await open('desktop', 'dark'));
  await home(page);
  await page.goto(BASE + await episodePath(page), { waitUntil: 'load' }); await page.waitForTimeout(3000); await shot(page, 'desktop-episode-dark');
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.click('#scheduleBtn'); await page.waitForTimeout(1500);
  await page.click('#schedGridBtn'); await page.waitForTimeout(2500); await shot(page, 'desktop-grid-dark');
  await ctx.close();

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
