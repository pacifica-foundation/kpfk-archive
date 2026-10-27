// Listener screenshots for the staff guide (docs/overview/README.md, "Staff guide"). Drives the LIVE
// site in headless WebKit (the iPhone/iPad engine). Read-only and uncounted:
//   - the usage beacon (/api/ev) is blocked, so these visits never reach the station's stats;
//   - the live stream is blocked and play() is refused (Safari's own first-visit rule), so the
//     Listen Live pictures show the big Play button and no listener connection is ever made.
// Playwright is not a dependency of this app: run it from a scratch folder,
//   NODE_PATH=<folder>/node_modules node docs/overview/capture-guide.cjs [https://podcasts.kpfk.org]
// Writes PNGs to docs/overview/raw/ (git-ignored) and prints the figures the captions quote.
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = (process.argv[2] || 'https://podcasts.kpfk.org').replace(/\/$/, '');
const OUT = path.join(__dirname, 'raw');
fs.mkdirSync(OUT, { recursive: true });
const SHOW = '/show/dn';          // the featured program: its newest episode has a real transcript
const SEARCH = process.env.SEARCH || 'climate';

const sizes = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true },
  tablet: { viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};
const REFUSE_AUTOPLAY = `(function(){ var real = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(){
    if(navigator.userActivation && !navigator.userActivation.isActive) return Promise.reject(new DOMException('refused', 'NotAllowedError'));
    return real.call(this); }; })();`;

(async () => {
  const b = await webkit.launch();
  const shot = async (page, name) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  ' + name); };
  const open = async (size, scheme, { refuse = false } = {}) => {
    const ctx = await b.newContext({ ...sizes[size], colorScheme: scheme });
    await ctx.route('**/api/ev', r => r.abort());                 // never count these visits
    await ctx.route(/streams\.pacifica\.org/, r => r.abort());    // never connect to the live stream
    if (refuse) await ctx.addInitScript(REFUSE_AUTOPLAY);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    return { ctx, page };
  };
  const home = async page => { await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(3000); };
  const episodePath = async page => page.evaluate(async show => {
    const r = await fetch('/api/archive').then(x => x.json());
    const eps = r.shows.filter(s => s.sho.endsWith('.' + show.split('/').pop())).sort((a, z) => z.dt - a.dt);
    return window.ShowLinks.episodePath(eps[0]);
  }, SHOW);
  const playFeatured = async page => {
    await page.goto(BASE + await episodePath(page), { waitUntil: 'load' }); await page.waitForTimeout(2500);
    await page.click('#sheetBody .sheet-play'); await page.waitForTimeout(2500);
  };

  // ---- Listen Live (/live), its first-visit state: the big Play button ----
  let { ctx, page } = await open('desktop', 'light', { refuse: true });
  await page.goto(BASE + '/live', { waitUntil: 'load' }); await page.waitForTimeout(4500);
  await shot(page, 'desktop-livepage-light');
  await ctx.close();
  ({ ctx, page } = await open('phone', 'dark', { refuse: true }));
  await page.goto(BASE + '/live', { waitUntil: 'load' }); await page.waitForTimeout(4500);
  await shot(page, 'phone-livepage-dark');
  await ctx.close();

  // ---- phone ----
  ({ ctx, page } = await open('phone', 'light'));
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
  await ctx.close();

  // ---- tablet: search ----
  ({ ctx, page } = await open('tablet', 'light'));
  await page.goto(BASE + '/?q=' + encodeURIComponent(SEARCH), { waitUntil: 'load' }); await page.waitForTimeout(3500);
  const counts = await page.evaluate(() => ({ shows: document.querySelectorAll('.search-show').length,
    summary: (document.querySelector('.search-summary, #resultCount, .count') || {}).textContent || '' }));
  console.log('  search "' + SEARCH + '": ' + JSON.stringify(counts));
  await shot(page, 'tablet-search-light');
  await ctx.close();

  // ---- desktop ----
  ({ ctx, page } = await open('desktop', 'light'));
  await home(page); await shot(page, 'desktop-home-light');
  await page.click('#scheduleBtn'); await page.waitForTimeout(2500); await shot(page, 'desktop-schedule-light');
  await ctx.close();
  ({ ctx, page } = await open('desktop', 'dark'));
  await home(page);
  await page.goto(BASE + await episodePath(page), { waitUntil: 'load' }); await page.waitForTimeout(3000); await shot(page, 'desktop-episode-dark');
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.click('#scheduleBtn'); await page.waitForTimeout(1500);
  await page.click('#schedGridBtn'); await page.waitForTimeout(2500); await shot(page, 'desktop-grid-dark');
  await ctx.close();
  // Re-runs listed once: the program with the most "Also aired" notes, its episode list.
  ({ ctx, page } = await open('desktop', 'light'));
  await home(page);
  const rerun = await page.evaluate(async () => {
    const r = await fetch('/api/archive').then(x => x.json());
    const by = {};
    r.shows.forEach(e => { if (e.alsoAired && e.alsoAired.length) by[e.sho] = (by[e.sho] || 0) + 1; });
    const sho = Object.keys(by).sort((a, z) => by[z] - by[a])[0];
    return { path: window.ShowLinks.showPath(sho), notes: by[sho], total: Object.values(by).reduce((a, n) => a + n, 0) };
  });
  console.log('  re-runs: ' + JSON.stringify(rerun));
  await page.goto(BASE + rerun.path, { waitUntil: 'load' }); await page.waitForTimeout(3000);
  await page.evaluate(() => { const a = document.querySelector('.sheet-episode-also'); if (a) a.scrollIntoView({ block: 'center' }); });
  await shot(page, 'desktop-rerun-light');
  await ctx.close();

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
