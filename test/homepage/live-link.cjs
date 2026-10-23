// /live as a link of its own (2026-10-23, Ace's review). For now it opens the Live popup over the
// home page; the Listen Live page (INT-966) will take this address over. Arriving at /live opens
// the popup; close or Back land on the home page and stay on the site. Opening Live from the header
// shows /live in the address bar; Past episodes opens the show at its /show/ address and Back returns
// to /live. Nothing here presses play — the live audio element is never touched.
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
    live: document.getElementById('livePlayer').classList.contains('show'),
    sheet: document.getElementById('showSheet').classList.contains('show') });`));
  const loaded = `return document.readyState === 'complete' && document.querySelectorAll('.ja-play').length > 0;`;
  const liveOpen = `return document.getElementById('livePlayer').classList.contains('show');`;
  const liveShut = `return !document.getElementById('livePlayer').classList.contains('show');`;
  const sheetOpen = `return document.getElementById('showSheet').classList.contains('show');`;
  let s;

  for (const [label, width] of [['phone', 390], ['desktop', 1280]]) {
    await p.send('Emulation.setDeviceMetricsOverride', { width, height: width < 800 ? 844 : 900, deviceScaleFactor: width < 800 ? 2 : 1, mobile: width < 800 });
    // 1. Arriving at /live.
    await p.send('Page.navigate', { url: base + '/live' });
    await until(loaded, 30000);
    check(`${label}: /live opens the Live popup`, await until(liveOpen, 15000), JSON.stringify(await state()));
    s = await state();
    check(`${label}: … at /live`, s.path === '/live', s.path);
    await p.eval(`history.back(); return 1;`);
    check(`${label}: Back closes it`, await until(liveShut, 5000));
    s = await state();
    check(`${label}: … onto the home page, still on the site`, s.path === '/' && s.origin === base, JSON.stringify(s));
    // 2. The close button.
    await p.send('Page.navigate', { url: base + '/live/' });
    await until(loaded, 30000); await until(liveOpen, 15000);
    await p.clickInPlace('#lpClose');
    check(`${label}: the close button closes it`, await until(liveShut, 5000));
    check(`${label}: … and the address is the home page`, (await state()).path === '/');
  }

  // 3. From the header's On Air button, then Past episodes (desktop, still at 1280).
  await p.clickInPlace('#onAirBtn');
  check('the On Air button opens Live', await until(liveOpen, 8000));
  check('… and the address bar shows /live', (await state()).path === '/live');
  const hasArchive = await until(`var b = document.getElementById('lpArchive'); return !!b && !b.hidden && b.offsetHeight > 0;`, 10000);
  if (!hasArchive) console.log('SKIP Past episodes: the show on air now has no episodes');
  else {
    await p.clickInPlace('#lpArchive');
    check('Past episodes opens the show', await until(sheetOpen, 8000));
    s = await state();
    check('… at its /show/ address', /^\/show\//.test(s.path), s.path);
    await p.eval(`history.back(); return 1;`);
    check('Back returns to Live, at /live', await until(liveOpen, 5000) && (await state()).path === '/live', JSON.stringify(await state()));
  }
  await p.eval(`history.back(); return 1;`);
  check('Back again closes Live', await until(liveShut, 5000));
  s = await state();
  check('… onto the home page', s.path === '/' && s.origin === base && !s.sheet, JSON.stringify(s));
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
