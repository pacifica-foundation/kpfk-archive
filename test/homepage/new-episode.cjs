// A new episode list arriving in the background must reach every open view built from it
// (2026-10-27, Ace's review: Nader showed 9 episodes on the show page, 8 in the Live popup).
// The page takes in new episodes two ways: the full refresh (`ingest`) redrew the Live popup,
// schedule and open show sheet; the quiet background update (`quietUpdate`) redrew Just aired
// only. An open show sheet or Now Playing kept the old list until closed. Both now call
// `repaintFromRows()`. The Live popup also repaints on its own 15-second now-playing timer, so
// it is not a reliable witness here and is left out.
//
// The browser is answered a changed /api/archive (one episode aged out, one new one in) and a
// new /api/archive/head revision; a real tab switch makes the page poll. Nothing is clicked to
// refresh. Shown to fail on the code before the fix.
// Live browser check against a running app (default :8081 — use the 8091 scratch server),
// Chrome remote debugging on CDP_PORT (default 9231, dedicated temporary profile, --mute-audio).
const { connect, sleep } = require('../live-stream/cdp.js');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0; const check = (name, v, detail) => { console.log((v ? 'PASS ' : 'FAIL ') + name + (v || detail === undefined ? '' : '\n     ' + detail)); if (!v) { failed++; process.exitCode = 1; } };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(200); } return false; };

  // ---- the data: a show with several episodes, then the same list one day later
  const real = await (await fetch(base + '/api/archive')).json();
  const byShow = {};
  for (const r of real.shows) if (r.mp3) (byShow[r.sho] = byShow[r.sho] || []).push(r);
  // A weekly show's worth (~9, like Nader): the sheet lists every episode, so the oldest is on screen.
  const [sho, eps] = Object.entries(byShow).filter(([, l]) => l.length >= 4)
    .sort((a, b) => Math.abs(a[1].length - 9) - Math.abs(b[1].length - 9))[0] || [];
  if (!sho) throw new Error('no show with 4+ episodes in /api/archive');
  eps.sort((a, b) => b.dt - a.dt);
  const oldest = eps[eps.length - 1], newest = eps[0];
  const added = { ...newest, id: newest.id + '-test-new', upstreamId: newest.upstreamId + '9', dt: newest.dt + 7 * 86400,
    dateText: 'Test day', episodeTitle: (newest.episodeTitle || newest.title) + ' (test, newer)' };
  const later = { ...real, revision: 'test-' + Date.now(), shows: [added, ...real.shows.filter(r => r.id !== oldest.id)] };
  const showPath = '/show/' + (newest.upstreamAltId || sho.split('.').pop());
  console.log(`show ${sho}: ${eps.length} episodes; ${showPath}`);

  let served = real;
  const b64 = s => Buffer.from(s).toString('base64');
  const json = (id, body) => p.send('Fetch.fulfillRequest', { requestId: id, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }], body: b64(JSON.stringify(body)) });
  p.on(m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params, u = new URL(request.url);
    if (u.pathname === '/api/archive') return json(requestId, served);
    if (u.pathname === '/api/archive/head') return json(requestId, { updated: Date.now(), count: served.shows.length,
      latest: Math.max(...served.shows.map(r => r.dt)), revision: served.revision, stale: false });
    return p.send('Fetch.continueRequest', { requestId });
  });
  await p.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/archive*' }] });

  // A real tab switch: the page polls on return when it hasn't checked in the last minute.
  const targets = await p.send('Target.getTargets');
  const mine = targets.targetInfos.find(t => t.type === 'page' && t.attached).targetId;
  const leaveAndReturn = async () => {
    const other = await p.send('Target.createTarget', { url: 'about:blank' });
    await until(`return document.visibilityState === 'hidden';`, 3000);
    await p.send('Target.activateTarget', { targetId: mine });
    await p.send('Target.closeTarget', { targetId: other.targetId });
  };
  const tally = `var t = document.querySelector('#showSheet .sheet-archive-tally'); return t ? t.textContent : '';`;
  const count = s => (/(\d+) episodes?/.exec(s) || [])[1] | 0;

  // ---- 1. The show sheet, open while the list changes
  served = real;
  await p.send('Page.navigate', { url: base + showPath });
  await until(`return document.getElementById('showSheet').classList.contains('show') && !!document.querySelector('#showSheet .sheet-archive-tally');`, 30000);
  const before = await p.eval(tally);
  check('the show sheet opens with the full count', count(before) === eps.length, before);
  const oldestShown = `return !!document.querySelector('#showSheet [data-id=${JSON.stringify(oldest.id)}]');`;
  check('… and lists the oldest episode (so its going away can be seen)', await p.eval(oldestShown));
  served = later;
  await leaveAndReturn();
  check('a new list arrives quietly (the refresh pill appears)', await until(`var b = document.getElementById('refreshBtn'); return !!b && !b.hidden;`, 8000));
  check('… and the open sheet shows the new list (one aged out, one new: same count, new newest)',
    await until(`var s = document.getElementById('showSheet'); return s.textContent.indexOf(${JSON.stringify(added.episodeTitle)}) >= 0 || !!s.querySelector('[data-id=${JSON.stringify(added.id)}]');`, 8000),
    await p.eval(tally));
  check('… and no longer offers the episode that aged out', !(await p.eval(oldestShown)));

  // ---- 2. Now Playing's "More from this show", open while the list changes
  served = real;
  await p.send('Page.navigate', { url: base + '/' });
  await until(`return document.readyState === 'complete' && document.querySelectorAll('.ja-play').length > 0;`, 30000);
  await sleep(500);
  await p.eval(`window.ArchiveApp.player.play(${JSON.stringify(eps[1].id)}); return 1;`);
  await until(`return !!window.ArchiveApp.player.current();`, 10000);
  await p.eval(`window.NowPlaying.open(); return 1;`);
  check('Now Playing opens with this show\'s episodes',
    await until(`var l = document.querySelectorAll('.np-list .np-ep'); return window.NowPlaying.isOpen() && l.length > 0;`, 8000));
  const hasNew = `return !!document.querySelector('.np-list .np-ep[data-id=${JSON.stringify(added.id)}]');`;
  check('… not yet the new episode', !(await p.eval(hasNew)));
  served = later;
  await leaveAndReturn();
  check('the new episode appears in "More from this show" while it is open', await until(hasNew, 8000));
  check('Now Playing is still open', await p.eval(`return window.NowPlaying.isOpen();`));
  await p.eval(`window.ArchiveApp.player.audio.pause(); return 1;`);

  await p.send('Fetch.disable');
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
