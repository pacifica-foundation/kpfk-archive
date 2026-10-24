// An open page and a deploy (public/update.js, Paul 2026-10-23). After a deploy, a page left open
// (phones keep them for days) or loaded mid-deploy runs old code against the new server, or new
// code against an old settings file: the second crashed the Transcript panel on 2026-10-23 until
// Paul reloaded by hand. A deploy is faked in the browser: /api/version answers a new build, or
// /station.js answers the old settings file (no `copy`, no AppBuild). Leaving and coming back is
// done for real: a second tab is opened and the page's tab brought back (visibilitychange fires).
// QIR has no key off Coolify, so its catalog and one transcript are answered by the browser.
//   1. nothing new: coming back does nothing;
//   2. new build, nothing playing: coming back reloads the page, once (no reload loop);
//   3. new build while an episode plays: no reload, the episode keeps playing, a banner offers
//      Reload; after pausing, the next return reloads, and the place in the episode is kept;
//   4. old settings file (the 2026-10-23 mix): the page reloads itself at load, and with the
//      mix still there after the reload, Transcript opens and shows its lines (no crash).
// Shown to fail on the code before the fix (no reload in 2 and 3; in 4 the panel threw).
// Live browser check against a running app (default :8081 — use the 8091 scratch server),
// Chrome remote debugging on CDP_PORT (default 9231, dedicated temporary profile, --mute-audio).
const { connect, sleep } = require('../live-stream/cdp.js');
const base = process.env.APP_URL || 'http://localhost:8081';
const port = Number(process.env.CDP_PORT) || 9231;
(async () => {
  const p = await connect(port);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0; const check = (name, v, detail) => { console.log((v ? 'PASS ' : 'FAIL ') + name + (v || detail === undefined ? '' : '\n     ' + detail)); if (!v) { failed++; process.exitCode = 1; } };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(250); } return false; };
  const errors = [];
  let loads = 0;
  p.on(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || '').split('\n')[0]);
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) loads++;
  });

  // ---- the fake deploy, answered by the browser
  let fakeVersion = '', oldSettings = false;
  const real = await (await fetch(base + '/station.js')).text();
  // The settings file as the build before 2026-10-23 wrote it: no `copy`, no AppBuild line.
  const old = real.replace(/,"copy":\{[^}]*\}/, '').replace(/window\.AppBuild = [^\n]*\n?/, '');
  if (old === real || /"copy"|AppBuild/.test(old)) throw new Error('could not build the old settings file');
  const archive = await (await fetch(base + '/api/archive')).json();
  const rowsOf = a => (Array.isArray(a) ? a : a.shows || []);
  const mp3s = rowsOf(archive).map(r => r.mp3).filter(Boolean);
  if (!mp3s.length) throw new Error('no episodes in /api/archive: ' + Object.keys(archive));
  const catalog = { episodes: mp3s.map((mp3, i) => ({ public_id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'), mp3_url: mp3,
    show_key: 'x', headline: '', summary: '', air_date: '2026-10-23', air_start: null, duration_minutes: 60 })), artwork: { byShow: {}, byMp3: {} }, pending: 0, stale: false };
  const transcript = { provider: 'qir', transcript: 'First line. Second line.', language: 'English',
    vtt: 'WEBVTT\n\n00:00.000 --> 00:05.000\nFirst line of the test transcript.\n\n00:05.000 --> 00:10.000\nSecond line.' };
  const b64 = s => Buffer.from(s).toString('base64');
  const json = (id, body) => p.send('Fetch.fulfillRequest', { requestId: id, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }], body: b64(JSON.stringify(body)) });
  p.on(m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params, u = new URL(request.url);
    if (u.pathname === '/api/version' && fakeVersion) return json(requestId, { version: fakeVersion });
    if (u.pathname === '/station.js' && oldSettings) return p.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: b64(old) });
    if (u.pathname === '/api/plugins/qir/catalog') return json(requestId, catalog);
    if (u.pathname.startsWith('/api/plugins/qir/transcript/')) return json(requestId, { ...transcript, public_id: u.pathname.split('/').pop() });
    return p.send('Fetch.continueRequest', { requestId });
  });
  await p.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/version*' }, { urlPattern: '*/station.js*' }, { urlPattern: '*/api/plugins/qir/*' }] });

  // ---- leaving the page and coming back, for real: another tab in front, then this one again
  const targets = await p.send('Target.getTargets');
  const mine = targets.targetInfos.find(t => t.type === 'page' && t.attached).targetId;
  const leaveAndReturn = async () => {
    const other = await p.send('Target.createTarget', { url: 'about:blank' });
    await until(`return document.visibilityState === 'hidden';`, 3000);
    await p.send('Target.activateTarget', { targetId: mine });
    await p.send('Target.closeTarget', { targetId: other.targetId });
    await sleep(1500);
  };
  const mark = () => p.eval(`window.__sameLoad = true; return true;`);
  const sameLoad = () => p.eval(`return window.__sameLoad === true;`).catch(() => false);
  const banner = () => p.eval(`var b = document.getElementById('updateBanner'); return !!b && !b.hidden && b.offsetHeight > 0;`);
  const open = async () => {
    await p.send('Page.navigate', { url: base + '/' });
    return until(`return document.readyState === 'complete' && document.querySelectorAll('.ja-play').length > 0 && !!window.AppUpdate;`, 30000);
  };
  await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // 1. nothing new
  check('the page loads', await open());
  check('positive control: leaving makes the page hidden', await (async () => {
    const other = await p.send('Target.createTarget', { url: 'about:blank' });
    const hidden = await until(`return document.visibilityState === 'hidden';`, 3000);
    await p.send('Target.activateTarget', { targetId: mine }); await p.send('Target.closeTarget', { targetId: other.targetId });
    return hidden && await until(`return document.visibilityState === 'visible';`, 3000);
  })());
  await mark(); await leaveAndReturn();
  check('1. no new build: coming back keeps the page and shows no banner', await sameLoad() && !(await banner()));

  // 2. new build, nothing playing
  fakeVersion = 'test-build-2'; await mark(); const before2 = loads;
  await leaveAndReturn();
  check('2. new build, nothing playing: coming back reloads the page', !(await sameLoad()) && loads > before2, `loads ${before2} -> ${loads}`);
  await until(`return !!window.AppUpdate;`, 20000); await mark(); const after2 = loads;
  await leaveAndReturn();
  check('2. the same mismatch again (old and new servers both answering): no second reload, the banner instead',
    await sameLoad() && loads === after2 && await banner());

  // 3. new build while an episode plays
  fakeVersion = 'test-build-3';
  await open(); await sleep(800);
  await p.click('.ja-play');
  check('3. an episode plays', await until(`return window.ArchiveApp.soundOn() && document.getElementById('mainAudio').currentTime > 0;`, 20000));
  const mp3 = await p.eval(`return document.getElementById('mainAudio').currentSrc;`);
  await p.eval(`window.ArchiveApp.player.seek(150); return true;`); await sleep(1500);
  await mark();
  const t0 = await p.eval(`return document.getElementById('mainAudio').currentTime;`);
  await leaveAndReturn();
  const t1 = await p.eval(`return document.getElementById('mainAudio').currentTime;`).catch(() => -1);
  check('3. new build while playing: coming back does not reload', await sameLoad());
  check('3. ...the episode keeps playing', t1 > t0 && await p.eval(`return window.ArchiveApp.soundOn();`).catch(() => false), `time ${t0} -> ${t1}`);
  check('3. ...and the banner offers Reload, above the player bar', await banner() && await p.eval(`
    var b = document.getElementById('updateBanner').getBoundingClientRect(), bar = document.getElementById('playerBar').getBoundingClientRect();
    return b.bottom <= bar.top + 1;`));
  await p.eval(`window.ArchiveApp.player.toggle(); return true;`);
  check('3. paused', await until(`return !window.ArchiveApp.soundOn();`, 5000));
  await sleep(1000);
  check('3. pausing in front of the listener does not reload under them', await sameLoad() && await banner());
  const placed = await p.eval(`var m = JSON.parse(localStorage.getItem(StationConfig.storagePrefix + 'resume') || '{}'); var r = m[${JSON.stringify(mp3)}]; return r ? r.t : 0;`);
  await leaveAndReturn();
  check('3. the next return, nothing playing: reloaded', !(await sameLoad()));
  await until(`return !!window.AppUpdate;`, 20000);
  const kept = await p.eval(`var m = JSON.parse(localStorage.getItem(StationConfig.storagePrefix + 'resume') || '{}'); var r = m[${JSON.stringify(mp3)}]; return r ? r.t : 0;`);
  check('3. the place in the episode is kept across the reload', placed >= 150 && kept === placed, `saved ${placed}, after reload ${kept}`);

  // 4. the old settings file: the mix that broke Transcript on 2026-10-23
  fakeVersion = ''; oldSettings = true; errors.length = 0;
  const before4 = loads;
  await p.send('Page.navigate', { url: base + '/' });
  await sleep(6000);
  await until(`return document.readyState === 'complete' && document.querySelectorAll('.ja-play').length > 0 && !!window.AppUpdate;`, 30000);
  check('4. positive control: the page has the old settings file', await p.eval(`return !StationConfig.copy && window.AppBuild === undefined;`));
  check('4. a page with an old settings file reloads itself once at load', loads - before4 === 2, `page loads: ${loads - before4}`);
  check('4. ...and with the mix still there, offers Reload instead of looping', await banner());
  await sleep(1500); await p.click('.ja-play');
  await until(`var t = document.getElementById('playerAlong'); return !!t && !t.hidden;`, 20000);
  await p.click('#playerAlong');
  const shown = await until(`var a = document.getElementById('along'); return !!a && /First line of the test transcript/.test(a.innerText);`, 10000);
  check('4. Transcript opens and shows its lines with the old settings file', shown,
    await p.eval(`var a = document.getElementById('along'); return a ? a.innerText.slice(0, 200) : 'no panel';`).catch(e => e.message));
  check('4. ...without an error on the page', !errors.some(e => /transcriptNote|copy/.test(e)), errors.join(' | '));

  // Positive control for 4: the current settings file paints the station's line.
  oldSettings = false;
  await open(); await sleep(1500); await p.click('.ja-play');
  await until(`var t = document.getElementById('playerAlong'); return !!t && !t.hidden;`, 20000);
  await p.click('#playerAlong');
  check('positive control: with the current settings the transcript shows the station\'s note',
    await until(`var a = document.getElementById('along'); return !!a && a.innerText.indexOf(StationConfig.copy.transcriptNote) >= 0 && /First line/.test(a.innerText);`, 10000));
  await p.eval(`window.ArchiveApp.player.toggle(); return true;`).catch(() => {});

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
