// Every main page loads in a real browser with no uncaught error (2026-10-27: commit 3de07f8 made
// start-up code read `showInfo` before its `var` line ran; the live site died with "Cannot read
// properties of undefined" while all 239 offline tests passed — none of them loads the page).
// Also: a name tile (/api/artwork/tile/) draws, so a broken image route is caught too.
// Run through run.sh (own scratch server and muted Chrome). Shown to fail on 3de07f8: 11 of 11.
const { connect, sleep } = require('../live-stream/cdp.js');
const base = (process.env.APP || 'http://127.0.0.1:8091/').replace(/\/$/, '');
const PAGES = ['/', '/live', '/schedule', '/show/nader', '/show/cinemascore'];
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9232);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let errors = [];
  p.on(m => {
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(((d.exception && d.exception.description) || d.text).split('\n')[0]); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value || a.description).join(' '));
  });
  let failed = 0;
  const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : '\n     ' + detail)); if (!ok) failed++; };
  const until = async (js, ms) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(250); } return false; };
  for (const width of [390, 1280]) {
    await p.send('Emulation.setDeviceMetricsOverride', { width, height: width < 800 ? 844 : 900, deviceScaleFactor: 2, mobile: width < 800 });
    for (const path of PAGES) {
      errors = [];
      await p.send('Page.navigate', { url: base + path });
      // Loaded = the page script finished start-up and drew the listing.
      const ready = await until(`return document.readyState === 'complete' && !!window.ArchiveApp && document.querySelectorAll('.ja-play').length > 0;`, 20000);
      await sleep(1500);   // late start-up work (now playing, plugins)
      check(`${width}px ${path}: loads, no uncaught errors`, ready && !errors.length, errors.slice(0, 3).join('\n     ') || 'page script did not finish start-up');
    }
  }
  // Search: every show result shows why it matched — the word, highlighted, on the card
  // (2026-10-27: "nader" listed shows whose cards never mentioned Nader).
  for (const q of ['nader', 'food', 'gaza']) {
    errors = [];
    await p.send('Page.navigate', { url: base + '/?q=' + q });
    const shown = await until(`return document.querySelectorAll('.search-show').length > 0 || !!document.querySelector('.search-empty');`, 20000);
    const cards = await p.eval(`return JSON.stringify([...document.querySelectorAll('.search-show')].map(c => ({ name: (c.querySelector('.search-title') || {}).textContent, hit: [...c.querySelectorAll('mark.search-hit')].some(m => m.offsetWidth > 0) })));`);
    const missing = JSON.parse(cards).filter(c => !c.hit).map(c => c.name);
    check(`search "${q}": every show result shows the word (${JSON.parse(cards).length} shows), no errors`, shown && !missing.length && !errors.length,
      (missing.length ? 'no visible hit on: ' + missing.join(', ') : '') + (errors.length ? ' ' + errors[0] : ''));
  }
  await p.send('Page.navigate', { url: base + '/show/cinemascore' });
  await until(`return !!document.querySelector('#showSheet.show img[src*="/api/artwork/tile/"]');`, 15000);
  const tile = await p.eval(`var i = document.querySelector('#showSheet img[src*="/api/artwork/tile/"]'); return i ? (i.complete && i.naturalWidth > 0 ? 'drawn' : 'not drawn') : 'none';`);
  check('a show on the stand-in picture draws its name tile', tile === 'drawn', tile);
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
