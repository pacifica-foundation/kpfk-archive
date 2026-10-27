// The Listen Live page (/live, INT-966; Ace's review; mockup approved by Paul 2026-10-27).
// Real taps in Chrome on a scratch server (run.sh). What a listener arriving from kpfk.org gets:
//  1. /live is a page of its own (not a popup over the home page), at /live, with the site's
//     header and working menu, the show on air, today's schedule and the station's contacts.
//  2. One tap at most to audio: arrival tries to play; a browser that refuses (Safari's rule,
//     reproduced here) leaves the big Play button and NO error alert; one tap starts the stream.
//  3. It rolls over by itself when the show changes (now-playing poll), no reload.
//  4. A show page opens over it and the stream keeps playing; Back returns to /live.
//  5. The logo goes home (on the site); Back returns to /live; the stream is untouched.
//  6. Volume on desktop only; "Full page" only in a small desktop window; the app prompt on phones.
//  7. No sideways scroll at 390/420/768/1280, light and dark; the player bar never covers the end.
// Shown to fail on the code before the page (it opened the Live popup at /live).
const { connect, sleep } = require('../live-stream/cdp.js');
const base = (process.env.APP || 'http://127.0.0.1:8091/').replace(/\/$/, '');
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9233);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0;
  const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '\n     ' + detail)); if (!ok) failed++; };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(200); } return false; };
  const ev = js => p.eval(js).catch(e => 'ERR ' + e.message);
  let errors = [], infos = [];
  p.on(m => {
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(((d.exception && d.exception.description) || d.text).split('\n')[0]); }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map(a => a.value || a.description).join(' ');
      if (m.params.type === 'error') errors.push('console.error: ' + text);
      if (m.params.type === 'info') infos.push(text);
    }
  });
  const size = async (width, mobile) => {
    await p.send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 900, deviceScaleFactor: 2, mobile: !!mobile });
    await p.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: mobile ? 'none' : 'hover' }, { name: 'pointer', value: mobile ? 'coarse' : 'fine' }] });
  };
  const pageShown = `var s = document.getElementById('livePage'); return !!s && !s.hidden && s.offsetHeight > 200 && getComputedStyle(document.getElementById('top')).display === 'none';`;
  const homeShown = `var s = document.getElementById('livePage'); return (!s || s.hidden) && getComputedStyle(document.getElementById('top')).display !== 'none';`;
  const pressed = `return document.getElementById('lvPlay').getAttribute('aria-pressed');`;
  const alertUp = `var a = document.getElementById('lpAlert'); return !!a && !a.hidden;`;
  const ready = `return document.readyState === 'complete' && !!window.ArchiveApp && document.querySelectorAll('.ja-play').length > 0;`;

  // Safari's rule, reproduced: media may start only during a real tap.
  const { identifier: safariRule } = await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (function(){ var real = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function(){
        if(navigator.userActivation && !navigator.userActivation.isActive) return Promise.reject(new DOMException('The request is not allowed by the user agent', 'NotAllowedError'));
        return real.call(this); }; })();` });

  // On air for the whole run: the real now-playing reply, naming a show that has episodes here
  // (so "Show page" and "Latest" exist), until the rollover check changes the name.
  const real = await (await fetch(base + '/api/nowplaying')).json();
  const arch = await (await fetch(base + '/api/archive')).json();
  const counts = {}; for (const r of arch.shows) counts[r.sho] = (counts[r.sho] || 0) + 1;
  const sho = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const info = (Array.isArray(arch.directory) ? Object.fromEntries(arch.directory) : arch.directory)[sho] || {};
  const onAir = { ...(real.current || {}), altid: sho, upstreamAltId: sho.split('.').pop(), name: info.name || sho, dj: info.dj || '', photo: info.photo || (real.current || {}).photo };
  let rolled = false, holdStream = false;
  p.on(m => {
    if (m.method !== 'Fetch.requestPaused') return;
    // The live stream: let it through, after a pause while the spinner check needs the connecting state.
    if (!/\/api\/nowplaying/.test(m.params.request.url)) {
      setTimeout(() => p.send('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {}), holdStream ? 2500 : 0);
      return;
    }
    const body = { ...real, stale: false, current: rolled ? { ...onAir, name: 'Rollover Test Show', dj: 'Test Host' } : onAir };
    p.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64') });
  });
  const streamHost = new URL(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../stations/kpfk.json'), 'utf8')).liveStream).host;
  await p.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/nowplaying*' }, { urlPattern: '*' + streamHost + '*' }] });

  // ---- 1 + 2: arrival, autoplay refused (Safari), one tap
  await size(1280, false);
  errors = []; infos = [];
  await p.send('Page.navigate', { url: base + '/live' });
  await until(ready, 30000);
  check('arriving at /live shows the Listen Live page, not the home page', await until(pageShown, 10000), await ev(`return location.pathname + ' page=' + !document.getElementById('livePage') + ' popup=' + document.getElementById('livePlayer').classList.contains('show');`));
  check('… the address stays /live', (await ev(`return location.pathname;`)) === '/live', await ev(`return location.pathname;`));
  check('… the Live popup is not opened over it', !(await ev(`return document.getElementById('livePlayer').classList.contains('show');`)));
  check('… the show on air is named', await until(`var t = document.getElementById('lvTitle'); return !!t && t.textContent.trim().length > 1;`, 15000), await ev(`return document.getElementById('lvTitle') && document.getElementById('lvTitle').textContent;`));
  await sleep(2500);
  check('autoplay refused: no error alert, the Play button waits', !(await ev(alertUp)) && (await ev(pressed)) === 'false', `alert=${await ev(alertUp)} pressed=${await ev(pressed)} status=${await ev(`return document.getElementById('lvStatus').textContent;`)}`);
  check('… the refusal is logged, not swallowed', infos.some(t => /refused to start the stream on arrival/.test(t)), JSON.stringify(infos));
  check('… the status invites one tap', /Tap to listen/.test(await ev(`return document.getElementById('lvStatus').textContent;`)));
  holdStream = true;
  await p.click('#lvPlay');
  check('while connecting, the Play button shows a spinner (not the stop square)', await until(`var b = document.getElementById('lvPlay'), sp = b.querySelector('.spinner'), ic = b.querySelector('svg');
    return b.classList.contains('loading') && !!sp && getComputedStyle(sp).display === 'block' && sp.offsetWidth > 0 && getComputedStyle(ic).display === 'none';`, 2000),
    await ev(`var b = document.getElementById('lvPlay'); return b.className + ' ' + b.innerHTML.slice(0, 80);`));
  holdStream = false;
  check('one tap starts the stream (the page and the player bar agree)', await until(`return document.getElementById('lvPlay').getAttribute('aria-pressed') === 'true' && document.getElementById('playerBar').classList.contains('live') && !document.getElementById('playerBar').hidden;`, 8000),
    `pressed=${await ev(pressed)} bar=${await ev(`return document.getElementById('playerBar').className + ' hidden=' + document.getElementById('playerBar').hidden;`)}`);
  check('… still no error alert', !(await ev(alertUp)));

  // ---- the header menu works on the page
  await p.click('#menuBtn');
  check('the hamburger menu opens on the page', await until(`return document.body.classList.contains('menu-open') && document.getElementById('menuPanel').getAttribute('aria-hidden') === 'false';`, 3000));
  // The panel slides in; wait until its close button is on screen and on top before tapping it.
  await until(`var b = document.getElementById('menuClose').getBoundingClientRect(); var e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.right <= innerWidth && b.left >= 0 && !!e && document.getElementById('menuClose').contains(e);`, 3000);
  await p.click('#menuClose');
  check('… and closes', await until(`return !document.body.classList.contains('menu-open');`, 3000));
  check('the header On Air button is not shown on the page (this page is the player)', await ev(`var b = document.getElementById('onAirBtn'); return !b.offsetWidth && getComputedStyle(b).display === 'none';`));

  // ---- 4: /live does live things only (Paul, 2026-10-27). A show, an episode or the schedule switches
  // to the podcast front IN PLACE and opens there; the stream plays on in the bar; one Back or Close
  // returns to /live. Donate opens over the page. Links keep real hrefs (open in a new tab).
  check('the show on air has Show page, Past episodes and its latest episodes', await until(`var b = document.getElementById('lvShow'); return !!b && !b.hidden && !document.getElementById('lvEpisodes').hidden && document.querySelectorAll('#lvLatest .lv-row').length > 0;`, 10000),
    await ev(`return document.getElementById('lvTitle').textContent;`));
  await until(`return document.querySelectorAll('#lvToday .lv-row').length > 3;`, 15000);   // today's schedule has loaded
  const links = JSON.parse(await p.eval(`
    var pick = function(sel){ return [...document.querySelectorAll(sel)].map(function(a){ return { tag: a.tagName, path: a.getAttribute('href'), target: a.target }; }); };
    return JSON.stringify({ show: pick('#lvShow, #lvEpisodes, #lvAllEpisodes'), eps: pick('#lvLatest .lv-row'), today: pick('#lvToday a.lv-row'),
      full: pick('#livePage .lv-link:not(#lvAllEpisodes)') });`));
  const all = [...links.show, ...links.eps, ...links.today, ...links.full];
  check('every show, episode and schedule link is a real link (in this window)',
    all.length > 6 && all.every(l => l.tag === 'A' && !l.target), JSON.stringify(all.filter(l => l.tag !== 'A' || l.target).slice(0, 3)));
  check('… Show page and Past episodes point at the show\'s page', links.show.every(l => /^\/show\/[^/?]+$/.test(l.path)), JSON.stringify(links.show));
  check('… latest episodes at their episode pages', links.eps.every(l => /^\/show\/[^/?]+\/[^/?]+$/.test(l.path)), JSON.stringify(links.eps));
  check('… today\'s schedule rows at show pages', links.today.length > 2 && links.today.every(l => /^\/show\/[^/?]+$/.test(l.path)), JSON.stringify(links.today.slice(0, 3)));
  check('… Full schedule at the schedule page', links.full.length >= 1 && links.full.every(l => l.path === '/schedule'), JSON.stringify(links.full));
  const playing = `return window.ArchiveApp.soundOn() && window.ArchiveApp.barMode() === 'live' && !document.getElementById('playerBar').hidden;`;
  const onFront = `document.getElementById('livePage').hidden && getComputedStyle(document.getElementById('top')).display !== 'none'`;
  const sheetUp = `return document.getElementById('showSheet').classList.contains('show');`;
  const showPath = await ev(`return document.getElementById('lvShow').getAttribute('href');`);
  await p.click('#lvShow');
  check('Show page: the front opens in place with the show, at its address', await until(`return (${onFront}) && document.getElementById('showSheet').classList.contains('show') && location.pathname === ${JSON.stringify(showPath)};`, 6000),
    await ev(`return location.pathname + ' live=' + !document.getElementById('livePage').hidden;`));
  check('… the stream keeps playing in the player bar', await ev(playing));
  await p.eval(`history.back(); return 1;`);
  check('… one Back returns to /live, show closed, still playing', await until(`return location.pathname === '/live' && !document.getElementById('showSheet').classList.contains('show');`, 6000)
    && await ev(pageShown) && await ev(playing), await ev(`return location.pathname;`));
  await p.click('#scheduleBtn');
  check('header Schedule: the front opens in place with the schedule', await until(`return (${onFront}) && document.getElementById('schedModal').classList.contains('show') && location.pathname === '/schedule';`, 6000),
    await ev(`return location.pathname + ' live=' + !document.getElementById('livePage').hidden;`));
  await sleep(400);
  await p.click('#schedClose');
  check('… its Close returns to /live, still playing', await until(`return location.pathname === '/live' && !document.getElementById('schedModal').classList.contains('show');`, 6000)
    && await ev(pageShown) && await ev(playing), await ev(`return location.pathname;`));
  await p.click('#lvSchedWrap [data-lv-open="schedule"]');
  check('the page\'s Full schedule does the same', await until(`return location.pathname === '/schedule' && document.getElementById('schedModal').classList.contains('show') && document.getElementById('livePage').hidden;`, 6000));
  await p.eval(`history.back(); return 1;`);
  await until(`return location.pathname === '/live';`, 6000);
  const epPath = await ev(`return document.querySelector('#lvLatest a.lv-row').getAttribute('href');`);
  await p.click('#lvLatest a.lv-row');
  check('an episode: the front opens in place with the episode', await until(`return location.pathname === ${JSON.stringify(epPath)} && document.getElementById('showSheet').classList.contains('show') && document.getElementById('livePage').hidden;`, 6000), await ev(`return location.pathname;`));
  await sleep(400);
  await p.click('#sheetClose');
  check('… its Close returns to /live, still playing', await until(`return location.pathname === '/live' && !document.getElementById('showSheet').classList.contains('show');`, 6000)
    && await ev(pageShown) && await ev(playing), await ev(`return location.pathname;`));
  // The sheet slides away; tap Donate once nothing covers it.
  await until(`var d = document.getElementById('lvDonate'); d.scrollIntoView({block: 'center'}); var b = d.getBoundingClientRect(); var e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && d.contains(e);`, 4000);
  await p.click('#lvDonate');
  check('Donate opens over the page (stays on /live, still playing)', await until(`return document.getElementById('donateModal').classList.contains('show');`, 4000)
    && (await ev(`return location.pathname;`)) === '/live' && await ev(pageShown) && await ev(playing));
  await p.click('#donateClose');
  await until(`return !document.getElementById('donateModal').classList.contains('show');`, 4000);

  // ---- 5: logo home, Back to /live, stream untouched
  await p.click('.appbar .brand');
  check('the logo goes to the home page, on the site', await until(homeShown, 5000) && (await ev(`return location.pathname;`)) === '/' && (await ev(`return location.origin;`)) === base);
  check('… the stream keeps playing in the player bar', await ev(`return document.getElementById('playerBar').classList.contains('live') && !document.getElementById('playerBar').hidden;`) && (await ev(pressed)) === 'true');
  await p.eval(`history.back(); return 1;`);
  check('Back returns to the Listen Live page', await until(pageShown, 5000) && (await ev(`return location.pathname;`)) === '/live');

  // ---- today's schedule and contacts
  check('today’s schedule is listed', await until(`return document.querySelectorAll('#lvToday .lv-row').length > 3;`, 15000), await ev(`return document.getElementById('lvToday').textContent.slice(0,120);`));
  check('contacts: the studio call-in line is a phone link', await ev(`return [...document.querySelectorAll('#lvContacts a')].some(a => /^tel:\\+?\\d{10,}/.test(a.getAttribute('href')));`));
  check('… a contact the station has not set (studio email) is not shown', !(await ev(`return !!document.querySelector('#lvContacts a[href^="mailto:"]');`)));

  // ---- 3: rollover from the now-playing poll, no reload
  await p.eval(`window.__sameLoad = true; return 1;`);
  rolled = true;
  check('the page rolls over to the next show by itself (no reload)', await until(`return window.__sameLoad === true && document.getElementById('lvTitle').textContent === 'Rollover Test Show';`, 20000), await ev(`return document.getElementById('lvTitle').textContent;`));
  rolled = false;
  await p.click('#lvPlay');
  check('Stop stops the stream', await until(`return document.getElementById('lvPlay').getAttribute('aria-pressed') === 'false';`, 5000));

  // ---- 6 + 7: device rules and layout at each width, light and dark
  for (const [label, width, mobile] of [['iPhone', 390, true], ['popup window', 420, false], ['tablet', 768, true], ['desktop', 1280, false]]) {
    for (const theme of ['light', 'dark']) {
      await size(width, mobile);
      await p.send('Page.navigate', { url: base + '/live' });
      await until(ready, 30000); await until(pageShown, 10000);
      await p.eval(`document.documentElement.dataset.theme = '${theme}'; return 1;`);
      await sleep(400);
      const L = JSON.parse(await p.eval(`
        var vis = function(id){ var e = document.getElementById(id); return !!e && !e.hidden && e.offsetWidth > 0; };
        var bar = document.getElementById('playerBar').getBoundingClientRect();
        window.scrollTo(0, document.documentElement.scrollHeight);
        var last = [...document.querySelectorAll('#livePage .lv-col > *, #livePage .lv-foot')].filter(function(e){ return e.offsetHeight > 0; }).pop();
        var lastBottom = last ? last.getBoundingClientRect().bottom : 0;
        var barNow = document.getElementById('playerBar');
        var barTop = barNow.hidden ? innerHeight : barNow.getBoundingClientRect().top;
        return JSON.stringify({ sideways: document.documentElement.scrollWidth - innerWidth, vol: vis('lvVol'), full: vis('lvFull'), app: vis('lvApp'),
          sched: vis('lvSchedWrap') && getComputedStyle(document.getElementById('lvSchedWrap')).display !== 'none', covered: lastBottom > barTop + 1, lastBottom: lastBottom, barTop: barTop,
          // Wide only: the schedule's Full schedule link is on screen and not covered, scrolled to the
          // bottom of the page (the schedule card is pinned); no contact card reaches under the card.
          // Scrolled to the end of today, as when the card follows the show on air late in the day
          // (Paul's 2026-10-27 screenshot): both the card and its list are scrolled as far as they go.
          fullSched: (function(){ var l = document.querySelector('#lvSchedWrap .lv-link'); if(!l || !l.offsetWidth) return null;
            [document.getElementById('lvSchedWrap'), document.getElementById('lvToday')].forEach(function(e){ e.scrollTop = e.scrollHeight; });
            var r = l.getBoundingClientRect(); var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { onScreen: r.top >= 0 && r.bottom <= innerHeight, reachable: !!hit && (hit === l || l.contains(hit)), listScrolls: document.getElementById('lvToday').scrollHeight > document.getElementById('lvToday').clientHeight }; })(),
          under: (function(){ var a = document.getElementById('lvSchedWrap'); if(!a.offsetWidth) return []; var left = a.getBoundingClientRect().left;
            return [...document.querySelectorAll('#lvContacts .lv-contact, #lvSignals')].filter(function(c){ return c.offsetWidth && c.getBoundingClientRect().right > left; }).map(function(c){ return c.textContent.trim().slice(0, 24); }); })() });`));
      const tag = `${label} ${width} ${theme}`;
      check(`${tag}: no sideways scroll`, L.sideways <= 0, 'overflow ' + L.sideways + 'px');
      check(`${tag}: volume ${mobile ? 'hidden (side buttons)' : 'shown'}`, L.vol === !mobile, JSON.stringify(L));
      check(`${tag}: "Full page" ${width === 420 && !mobile ? 'shown (small window)' : 'hidden'}`, L.full === (width === 420 && !mobile), JSON.stringify(L));
      check(`${tag}: app prompt ${mobile ? 'shown' : 'hidden'}`, L.app === !!mobile, JSON.stringify(L));
      check(`${tag}: today's schedule column ${width >= 900 ? 'shown' : 'not shown (Up next instead)'}`, L.sched === (width >= 900), JSON.stringify(L));
      check(`${tag}: the player bar never covers the end of the page`, !L.covered, JSON.stringify(L));
      if (width >= 900) {
        check(`${tag}: "Full schedule" stays on screen beside the pinned schedule (its list scrolls${L.fullSched && L.fullSched.listScrolls ? '' : ' — NOT long enough to prove it'})`,
          !!L.fullSched && L.fullSched.onScreen && L.fullSched.reachable && L.fullSched.listScrolls, JSON.stringify(L.fullSched));
        check(`${tag}: no contact card or signal line reaches under the schedule`, !L.under.length, JSON.stringify(L.under));
      }
    }
  }
  await p.send('Fetch.disable');
  check('no uncaught errors anywhere in the run', !errors.length, errors.slice(0, 3).join('\n     '));
  await p.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: safariRule });
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
