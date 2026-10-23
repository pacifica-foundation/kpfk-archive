// /schedule as a link of its own (Ace's review, 2026-10-23: kpfk.org and social posts need to link
// to the schedule). Arriving at /schedule opens the schedule over the home page; closing it, or
// Back, lands on the home page and stays on the site. Opening it from the header shows /schedule in
// the address bar (copyable); a show opened from it has its own /show/ address, and Back returns to
// /schedule; a show popup closed on top of the schedule leaves the address at /schedule.
// Live browser check against a running app (default :8081 — use the 8091 scratch server),
// Chrome remote debugging on CDP_PORT (default 9231, dedicated temporary profile, --mute-audio).
const { connect, sleep } = require('../live-stream/cdp.js');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0; const check = (name, v, detail) => { console.log((v ? 'PASS ' : 'FAIL ') + name + (v || detail === undefined ? '' : '\n     ' + detail)); if (!v) { failed++; process.exitCode = 1; } };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(200); } return false; };
  const state = async () => JSON.parse(await p.eval(`return JSON.stringify({
    path: location.pathname, origin: location.origin,
    sched: document.getElementById('schedModal').classList.contains('show'),
    sheet: document.getElementById('showSheet') ? document.getElementById('showSheet').classList.contains('show') : false });`));
  const loaded = `return document.readyState === 'complete' && document.querySelectorAll('.ja-play').length > 0;`;
  const schedOpen = `return document.getElementById('schedModal').classList.contains('show') && document.querySelectorAll('.sched-show').length > 0;`;
  const schedShut = `return !document.getElementById('schedModal').classList.contains('show');`;
  await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // 1. Arriving at /schedule.
  await p.send('Page.navigate', { url: base + '/schedule' });
  await until(loaded, 30000);
  check('/schedule opens the schedule', await until(schedOpen, 15000), JSON.stringify(await state()));
  let s = await state();
  check('the address stays /schedule while it is open', s.path === '/schedule', s.path);
  await p.eval(`history.back(); return 1;`);
  check('Back closes it', await until(schedShut, 5000));
  s = await state();
  check('… onto the home page, still on the site', s.path === '/' && s.origin === base, JSON.stringify(s));

  // 2. Close button from the link.
  await p.send('Page.navigate', { url: base + '/schedule/' });
  await until(loaded, 30000); await until(schedOpen, 15000);
  await p.clickInPlace('#schedClose');
  check('the close button closes it', await until(schedShut, 5000));
  s = await state();
  check('… and the address is the home page', s.path === '/', s.path);

  // 3. Opened from the header (desktop: phones reach the schedule from the menu), then a show from it.
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await p.clickInPlace('#scheduleBtn');
  check('the header button opens the schedule', await until(schedOpen, 15000));
  s = await state();
  check('the address bar shows /schedule (copyable)', s.path === '/schedule', s.path);
  const hasShow = await p.eval(`var b = Array.from(document.querySelectorAll('.sched-show[data-id]')).find(function(x){ return x.offsetHeight > 0; });
    if(b){ b.scrollIntoView({block:'center'}); b.setAttribute('data-test-target',''); } return !!b;`);
  check('the probe finds a show in the schedule', hasShow);
  if (hasShow) {
    await sleep(300);
    await p.clickInPlace('[data-test-target]');
    check('a show opens from the schedule', await until(`return document.getElementById('showSheet').classList.contains('show');`, 8000));
    s = await state();
    check('… at its own /show/ address', /^\/show\//.test(s.path), s.path);
    await p.eval(`history.back(); return 1;`);
    check('Back closes the show', await until(`return !document.getElementById('showSheet').classList.contains('show');`, 5000));
    s = await state();
    check('… onto the schedule, at /schedule', s.sched && s.path === '/schedule', JSON.stringify(s));
    await p.eval(`history.back(); return 1;`);
    check('Back again closes the schedule', await until(schedShut, 5000));
    s = await state();
    check('… onto the home page', s.path === '/' && s.origin === base, JSON.stringify(s));
  }
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
