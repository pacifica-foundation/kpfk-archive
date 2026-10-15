// Studio screenshots for the overview PDF (README "Regenerate", step 1b). Desktop only (Paul).
// The live studio's password is only in Coolify, so these come from a SCRATCH server with a
// throwaway password and a COPY of a data folder (its stats give the charts something to show —
// example figures, said so in the PDF). Never point this at production or at port 8081.
//   cp -R data/. /tmp/ov-data/ && PORT=8091 DATA_DIR=/tmp/ov-data STUDIO_PASSWORD=<throwaway> node tools/start.js
//   NODE_PATH=/tmp/pw/node_modules STUDIO_PASSWORD=<throwaway> node docs/overview/capture-studio.cjs [http://127.0.0.1:8091]
const { webkit } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8091').replace(/\/$/, '');
const PASSWORD = process.env.STUDIO_PASSWORD;
if (!PASSWORD) { console.error('STUDIO_PASSWORD (the scratch server\'s throwaway) is required'); process.exit(1); }
if (/kpfk\.org/.test(BASE)) { console.error('Refusing to sign in to a live site.'); process.exit(1); }
const OUT = path.join(__dirname, 'raw');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await webkit.launch();
  const shot = async (page, name, opts = {}) => { await page.waitForTimeout(1000); await page.screenshot({ path: path.join(OUT, name + '.png'), ...opts }); console.log('  ' + name); };
  const session = async scheme => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    return { ctx, page };
  };
  const signIn = async page => {
    await page.goto(BASE + '/studio', { waitUntil: 'load' }); await page.waitForTimeout(800);
    await page.fill('#password', PASSWORD); await page.click('#submit');
    await page.waitForSelector('#tabStats', { timeout: 15000 }); await page.waitForTimeout(3000);
  };

  // Sign-in and the Listening dashboard — light
  let { ctx, page } = await session('light');
  await page.goto(BASE + '/studio', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await shot(page, 'studio-login-light');
  await signIn(page);
  await page.evaluate(() => { const h = [...document.querySelectorAll('.studio-h2')].find(e => /Listening/.test(e.textContent)); if (h) h.closest('section').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
  await shot(page, 'studio-listening-light');
  // The printable report, over every day this copy has listening for (this month alone can be
  // near-empty on a scratch copy and reads as broken).
  const report = await ctx.newPage();
  await report.setViewportSize({ width: 1100, height: 1400 });
  await report.goto(BASE + '/studio/report?from=2026-09-01&to=' + new Date().toISOString().slice(0, 10), { waitUntil: 'load' });
  await report.waitForTimeout(2500);
  await shot(report, 'studio-report-light');
  await ctx.close();

  // Import / Export and Discovery & settings — dark
  ({ ctx, page } = await session('dark'));
  await signIn(page);
  await shot(page, 'studio-top-dark');
  await page.click('#exportOpen'); await page.waitForTimeout(1500);
  await shot(page, 'studio-export-dark');
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  if (await page.locator('#tabDiscovery').isVisible()) { await page.click('#tabDiscovery'); await page.waitForTimeout(2000); await shot(page, 'studio-settings-dark'); }
  await ctx.close();
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
