// Studio and fund drive screenshots for the staff guide (docs/overview/README.md, "Staff guide").
// The live studio's password is only in Coolify, so these come from a SCRATCH server with a
// throwaway password and a COPY of a data folder: the dashboard's figures and the fund drive's are
// examples, and the guide's captions say so. Never point this at production or at port 8081.
//   cp -R data/. <tmp>/ && rm -rf <tmp>/fund-drive && PORT=8091 DATA_DIR=<tmp> STUDIO_PASSWORD=<throwaway> node tools/start.js
//   NODE_PATH=<folder>/node_modules STUDIO_PASSWORD=<throwaway> node docs/overview/capture-guide-studio.cjs [http://127.0.0.1:8091]
// The live stream is blocked and play() refused, so no listener connection is ever made.
const { webkit } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8091').replace(/\/$/, '');
const PASSWORD = process.env.STUDIO_PASSWORD;
if (!PASSWORD) { console.error('STUDIO_PASSWORD (the scratch server\'s throwaway) is required'); process.exit(1); }
if (/kpfk\.org/.test(BASE)) { console.error('Refusing to sign in to a live site.'); process.exit(1); }
const OUT = path.join(__dirname, 'raw');
fs.mkdirSync(OUT, { recursive: true });
const REFUSE_AUTOPLAY = `(function(){ var real = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(){
    if(navigator.userActivation && !navigator.userActivation.isActive) return Promise.reject(new DOMException('refused', 'NotAllowedError'));
    return real.call(this); }; })();`;

(async () => {
  const b = await webkit.launch();
  const shot = async (page, name, opts = {}) => { await page.waitForTimeout(1200); await page.screenshot({ path: path.join(OUT, name + '.png'), ...opts }); console.log('  ' + name); };
  const session = async (scheme, viewport = { width: 1440, height: 900 }, extra = {}) => {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, colorScheme: scheme, ...extra });
    await ctx.route(/streams\.pacifica\.org/, r => r.abort());
    await ctx.addInitScript(REFUSE_AUTOPLAY);
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    return { ctx, page };
  };
  const signIn = async page => {
    await page.goto(BASE + '/studio', { waitUntil: 'load' }); await page.waitForTimeout(800);
    await page.fill('#password', PASSWORD); await page.click('#submit');
    await page.waitForSelector('#tabStats', { timeout: 15000 }); await page.waitForTimeout(3000);
  };

  // Sign-in and the printable report — light
  let { ctx, page } = await session('light');
  await page.goto(BASE + '/studio', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await shot(page, 'studio-login-light');
  await signIn(page);
  const report = await ctx.newPage();
  await report.setViewportSize({ width: 1100, height: 1400 });
  await report.goto(BASE + '/studio/report?from=2026-09-01&to=' + new Date().toISOString().slice(0, 10), { waitUntil: 'load' });
  await report.waitForTimeout(2500);
  await shot(report, 'studio-report-light');
  // The Fund drive card: example figures typed and saved, then switched on, as staff would
  // (since 2026-10-28: Update figures saves; the switch acts after an in-app confirm box).
  // Status lines are polled: waitForFunction is refused by the studio's script-src 'self', no eval.
  const waitStatus = async re => {
    for (let i = 0; i < 40; i++) { if (re.test(await page.textContent('#fdStatus'))) return; await page.waitForTimeout(250); }
    throw new Error('fund drive status never matched ' + re + ': ' + await page.textContent('#fdStatus'));
  };
  await page.click('#tabDiscovery'); await page.waitForSelector('#fundSection:not([hidden])');
  await page.click('[data-fd-style="classic"]');
  await page.fill('#fdName', 'Fall Fund Drive');
  await page.fill('#fdGoal', '75000'); await page.press('#fdGoal', 'Tab');
  await page.fill('#fdPledged', '42350'); await page.press('#fdPledged', 'Tab');
  await page.click('#fdPublish'); await waitStatus(/Saved|Updated/);
  if ((await page.getAttribute('#fdOn', 'aria-checked')) !== 'true') {
    await page.waitForTimeout(1500);   // the studio takes one fund drive action a second ("Too fast")
    await page.click('#fdOn'); await page.click('.studio-dialog [data-answer="yes"]'); await waitStatus(/^On\./);
  }
  await page.evaluate(() => { document.getElementById('fundSection').scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); });
  await shot(page, 'studio-funddrive-light');
  await ctx.close();

  // The dashboard and Import / Export — dark
  ({ ctx, page } = await session('dark'));
  await signIn(page);
  await shot(page, 'studio-top-dark');
  await page.click('#exportOpen'); await page.waitForTimeout(1500);
  await shot(page, 'studio-export-dark');
  await ctx.close();

  // Listen Live with the fund drive on: the banner and the capsule — desktop light, phone dark
  ({ ctx, page } = await session('light'));
  await page.goto(BASE + '/live', { waitUntil: 'load' }); await page.waitForTimeout(5000);
  await shot(page, 'desktop-funddrive-light');
  await ctx.close();
  ({ ctx, page } = await session('dark', { width: 390, height: 844 }, { hasTouch: true }));
  await page.goto(BASE + '/live', { waitUntil: 'load' }); await page.waitForTimeout(5000);
  await page.evaluate(() => { const c = document.getElementById('lvFund'); if (c) window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + scrollY - 520)); });
  await shot(page, 'phone-funddrive-dark');
  await ctx.close();
  // The embed for the station's website, as a strip on a page
  ({ ctx, page } = await session('light', { width: 640, height: 190 }));
  await page.goto(BASE + '/embed/fund-drive?theme=light', { waitUntil: 'load' }); await page.waitForTimeout(3000);
  await shot(page, 'embed-funddrive-light');
  await ctx.close();
  // The three styles (2026-10-29), as the embed draws each one on a station's page: the width of
  // the spot it is made for, the height the studio's snippet gives it (EMBED_H in studio-fund-drive.js).
  for (const [style, viewport, theme] of [['classic', { width: 640, height: 170 }, 'light'],
    ['slim', { width: 900, height: 120 }, 'light'], ['ring', { width: 320, height: 340 }, 'dark']]) {
    ({ ctx, page } = await session(theme, viewport));
    await page.goto(BASE + '/embed/fund-drive?theme=' + theme + '&style=' + style, { waitUntil: 'load' }); await page.waitForTimeout(3000);
    await shot(page, 'embed-' + style + '-' + theme);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
