// The Listen Live page (/live, INT-966; Ace's review; mockup approved by Paul 2026-10-27).
// Real taps in Chrome on a scratch server (run.sh). What a listener arriving from kpfk.org gets:
//  1. /live is a page of its own (not a popup over the home page), at /live, with the site's
//     header and working menu, the show on air, today's schedule and the station's contacts.
//  2. One tap at most to audio: arrival tries to play; a browser that refuses (Safari's rule,
//     reproduced here) leaves the big Play button and NO error alert; one tap starts the stream.
//  3. It rolls over by itself when the show changes (now-playing poll), no reload.
//  4. Live things only (Paul, 2026-10-27): a live-only header; a show, an episode or the schedule
//     moves the listener to the podcast front with that popup; closing it leaves them on the front
//     (the browser's Back returns to /live); the stream keeps playing. No second live player over
//     the page. Donate opens over the page. The big Play button shows a spinner while connecting.
//  5. The logo goes home (on the site); Back returns to /live; the stream is untouched.
//  6. Volume on desktop only; "Full page" only in a small desktop window; the app prompt on phones.
//  7. No sideways scroll at 390/420/768/1280, light and dark; the player bar never covers the end.
//  8. The plain live player (Paul, 2026-10-28): no bottom player on /live (and no space kept for
//     it); leaving explains itself first (Stay, Escape: still on /live; Go: the front, with the
//     player bar); "Don't show this again" sends later links straight through; the stream plays
//     throughout. Phones: a slim strip under the header while the page's player is scrolled away.
//  9. The description folds (Paul, 2026-10-30): beside the artwork it ends level with the artwork's
//     bottom, Show more included; on phones four lines; Show more / Show less open and close it.
//     The hosts are bold, in a colour of their own. Measured on the show with the longest
//     description, at three desktop widths and a phone.
// Shown to fail on the code before the page (it opened the Live popup at /live).
const { connect, sleep } = require('../live-stream/cdp.js');
const base = (process.env.APP || 'http://127.0.0.1:8091/').replace(/\/$/, '');
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9233);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0;
  const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '\n     ' + detail)); if (!ok) failed++; };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(200); } return false; };
  // A failed page eval is FALSE (and printed), never a truthy error string: an error text used to
  // pass a check that crashed (2026-10-27, the studio banner check passed on code with no banner).
  const ev = js => p.eval(js).catch(e => { console.log('     (page eval failed: ' + String(e.message).slice(0, 160) + ')'); return false; });
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
  // The stream is playing, whether or not a player bar is drawn (on /live none is).
  const streaming = `return window.ArchiveApp.soundOn() && window.ArchiveApp.barMode() === 'live';`;
  const barDrawn = `var b = document.getElementById('playerBar'); return !b.hidden && b.offsetHeight > 0;`;
  const leaveUp = `var d = document.getElementById('lvLeave'); return !!d && d.open && d.offsetHeight > 0;`;
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
  let rolled = false, holdStream = false, onAirOverride = null;
  p.on(m => {
    if (m.method !== 'Fetch.requestPaused') return;
    // The live stream: let it through, after a pause while the spinner check needs the connecting state.
    if (!/\/api\/nowplaying/.test(m.params.request.url)) {
      setTimeout(() => p.send('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {}), holdStream ? 2500 : 0);
      return;
    }
    const body = { ...real, stale: false, current: onAirOverride || (rolled ? { ...onAir, name: 'Rollover Test Show', dj: 'Test Host' } : onAir) };
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
  // The glow says the signal IS playing (Paul, 2026-10-28): not while it is still connecting.
  const glow = `var c = document.querySelector('#livePage .lv-player'), a = getComputedStyle(c, '::after'); return c.classList.contains('is-live') && a.animationName === 'lv-breathe' && parseFloat(a.opacity) > 0;`;
  check('… no live glow while connecting', !(await ev(glow)));
  holdStream = false;
  check('one tap starts the stream (the page and the live player agree)', await until(`return document.getElementById('lvPlay').getAttribute('aria-pressed') === 'true' && window.ArchiveApp.barMode() === 'live';`, 8000),
    `pressed=${await ev(pressed)} bar=${await ev(`return document.getElementById('playerBar').className + ' hidden=' + document.getElementById('playerBar').hidden;`)}`);
  await sleep(300);
  // The real stream connects over the network (the other stream waits here allow 8 s or more).
  check('… playing: the player card glows and breathes', await until(glow, 15000),
    await ev(`var c = document.querySelector('#livePage .lv-player'), a = getComputedStyle(c, '::after'); return c.className + ' ' + a.animationName + ' ' + a.opacity;`));
  check('… no bottom player on /live, and no space kept for one', !(await ev(barDrawn)) && (await ev(`return getComputedStyle(document.documentElement).getPropertyValue('--player-h').trim();`)) === '0px',
    await ev(`return document.getElementById('playerBar').offsetHeight + ' --player-h=' + getComputedStyle(document.documentElement).getPropertyValue('--player-h');`));
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
  // On the front the stream plays on in the player bar, drawn; on /live there is none (streaming).
  const playing = `return window.ArchiveApp.soundOn() && window.ArchiveApp.barMode() === 'live' && !document.getElementById('playerBar').hidden && document.getElementById('playerBar').offsetHeight > 0;`;
  const onFront = `document.getElementById('livePage').hidden && getComputedStyle(document.getElementById('top')).display !== 'none'`;
  const sheetUp = `return document.getElementById('showSheet').classList.contains('show');`;
  const showPath = await ev(`return document.getElementById('lvShow').getAttribute('href');`);
  const frontHome = `return location.pathname === '/' && (${onFront}) && !document.getElementById('showSheet').classList.contains('show') && !document.getElementById('schedModal').classList.contains('show');`;
  const backToLive = `return location.pathname === '/live' && !document.getElementById('livePage').hidden;`;
  // Live-only header (Paul, 2026-10-27): no Schedule or On Air button; Donate and the menu stay.
  check('live-only header: no Schedule or On Air button; Donate and the menu are there', await ev(`var h = function(id){ var e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.offsetWidth > 0; };
    return !h('scheduleBtn') && !h('onAirBtn') && h('donateBtn') && h('menuBtn');`));
  // Leaving explains itself first (Paul, 2026-10-28). Stay: nothing changes, the stream plays on.
  await p.click('#lvShow');
  check('Show page: an explainer first, the stream still playing', await until(leaveUp, 3000) && await ev(streaming)
    && /Podcasts/.test(await ev(`return document.getElementById('lvLeaveTitle').textContent;`)) && /keeps playing/.test(await ev(`return document.getElementById('lvLeaveText').textContent;`)),
    await ev(`return document.getElementById('lvLeave').open + ' ' + document.getElementById('lvLeave').textContent.replace(/\\s+/g, ' ').slice(0, 160);`));
  check('… the explainer blocks nothing: the page\'s Play/Stop is still tappable', await ev(`var d = document.getElementById('lvPlay'); d.scrollIntoView({block: 'center'}); var b = d.getBoundingClientRect(); var e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && d.contains(e);`),
    await ev(`var d = document.getElementById('lvPlay'), b = d.getBoundingClientRect(), e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e ? e.tagName + '#' + e.id + '.' + e.className : 'nothing';`));
  await p.click('#lvLeaveStay');
  check('… Stay: still on /live, the box gone, still streaming', await until(`return !document.getElementById('lvLeave').open;`, 3000)
    && await ev(backToLive) && await ev(streaming) && !(await ev(sheetUp)));
  await p.click('#lvShow');
  await until(leaveUp, 3000);
  await p.click('#lvLeaveGo');
  check('Show page: Go opens the podcast front with the show, at its address', await until(`return (${onFront}) && document.getElementById('showSheet').classList.contains('show') && location.pathname === ${JSON.stringify(showPath)};`, 6000),
    await ev(`return location.pathname + ' live=' + !document.getElementById('livePage').hidden;`));
  check('… the stream keeps playing in the player bar', await ev(playing));
  await sleep(400);
  await p.click('#sheetClose');
  check('… closing it leaves the listener ON THE FRONT, still playing', await until(frontHome, 6000) && await ev(playing), await ev(`return location.pathname + ' live=' + !document.getElementById('livePage').hidden;`));
  await p.eval(`history.back(); return 1;`);
  check('… the browser\'s Back from there returns to /live, still playing', await until(backToLive, 6000) && await ev(pageShown) && await ev(streaming), await ev(`return location.pathname;`));
  await p.click('#lvSchedWrap [data-lv-open="schedule"]');
  check('Full schedule: the explainer again (not dismissed yet)', await until(leaveUp, 3000) && await ev(streaming));
  await p.click('#lvLeaveGo');
  check('Full schedule: the front opens with the schedule', await until(`return location.pathname === '/schedule' && document.getElementById('schedModal').classList.contains('show') && document.getElementById('livePage').hidden;`, 6000));
  await sleep(400);
  await p.click('#schedClose');
  check('… closing it leaves the listener on the front', await until(frontHome, 6000) && await ev(playing), await ev(`return location.pathname;`));
  await p.eval(`history.back(); return 1;`);
  await until(backToLive, 6000);
  // The menu's Schedule asks too; Escape means Stay.
  await p.click('#menuBtn');
  await until(`var b = document.getElementById('menuSchedule').getBoundingClientRect(); var e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.right <= innerWidth && b.left >= 0 && !!e && document.getElementById('menuSchedule').contains(e);`, 3000);
  await p.click('#menuSchedule');
  check('the menu\'s Schedule: the explainer first', await until(leaveUp, 3000) && !(await ev(`return document.body.classList.contains('menu-open');`)));
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('… Escape means Stay: still on /live, still streaming', await until(`return !document.getElementById('lvLeave').open;`, 3000)
    && await ev(backToLive) && await ev(streaming) && !(await ev(`return document.getElementById('schedModal').classList.contains('show');`)));
  // "Don't show this again", then Go.
  const epPath = await ev(`return document.querySelector('#lvLatest a.lv-row').getAttribute('href');`);
  await p.click('#lvLatest a.lv-row');
  await until(leaveUp, 3000);
  await p.click('#lvLeaveAgain');
  await p.click('#lvLeaveGo');
  check('an episode: the front opens with the episode', await until(`return location.pathname === ${JSON.stringify(epPath)} && document.getElementById('showSheet').classList.contains('show') && document.getElementById('livePage').hidden;`, 6000), await ev(`return location.pathname;`));
  await sleep(400);
  await p.click('#sheetClose');
  check('… closing it leaves the listener on the front, still playing', await until(frontHome, 6000) && await ev(playing), await ev(`return location.pathname;`));
  // The sheet slides away first; tap On Air once nothing covers it (and say what does, if it stays covered).
  const onAirFree = `var d = document.getElementById('onAirBtn'), b = d.getBoundingClientRect(), e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && d.contains(e);`;
  const freed = await until(onAirFree, 4000);
  check('… on the front the On Air button is shown and free to tap', freed, await ev(`var d = document.getElementById('onAirBtn'), b = d.getBoundingClientRect(), e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e ? e.tagName + '.' + e.className + ' ' + e.outerHTML.slice(0, 120) : 'nothing';`));
  if (freed) check('… the front\'s own On Air button opens the Live popup there', await (async () => { await p.click('#onAirBtn'); return until(`return document.getElementById('livePlayer').classList.contains('show');`, 4000); })());
  await p.eval(`history.back(); return 1;`);
  await until(`return !document.getElementById('livePlayer').classList.contains('show');`, 4000);
  await p.eval(`history.back(); return 1;`);
  check('… and Back returns to /live', await until(backToLive, 6000) && await ev(pageShown));
  // The sheet slides away; tap Donate once nothing covers it.
  await until(`var d = document.getElementById('lvDonate'); d.scrollIntoView({block: 'center'}); var b = d.getBoundingClientRect(); var e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && d.contains(e);`, 4000);
  await p.click('#lvDonate');
  check('Donate opens over the page (stays on /live, still streaming)', await until(`return document.getElementById('donateModal').classList.contains('show');`, 4000)
    && (await ev(`return location.pathname;`)) === '/live' && await ev(pageShown) && await ev(streaming));
  // The donate page matches the site's light/dark (links.donateLight, 2026-10-28): a real tap on the
  // theme button between two opens, both themes checked.
  const LIGHT = 'https://docs.pacifica.org/kpfk/donate/light.html', DARK = 'https://docs.pacifica.org/kpfk/donate/';
  const donateFor = async () => ({ theme: await ev(`return window.StationTheme.active();`), src: await ev(`return document.getElementById('donateFrame').src;`) });
  const first = await donateFor();
  check(`Donate in ${first.theme} mode shows the ${first.theme} donate page`, first.src === (first.theme === 'light' ? LIGHT : DARK), JSON.stringify(first));
  await p.click('#donateClose');
  await until(`return !document.getElementById('donateModal').classList.contains('show');`, 4000);
  await p.click('#themeBtn');
  await sleep(300);
  await until(`var d = document.getElementById('lvDonate'); d.scrollIntoView({block: 'center'}); var b = d.getBoundingClientRect(); var e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && d.contains(e);`, 4000);
  await p.click('#lvDonate');
  await until(`return document.getElementById('donateModal').classList.contains('show');`, 4000);
  const second = await donateFor();
  check(`… after the theme button, ${second.theme} mode shows the ${second.theme} donate page`, second.theme !== first.theme && second.src === (second.theme === 'light' ? LIGHT : DARK), JSON.stringify(second));
  await p.click('#donateClose');
  await until(`return !document.getElementById('donateModal').classList.contains('show');`, 4000);
  await p.click('#themeBtn');   // back as it was
  await sleep(300);

  // ---- 5: logo home, Back to /live, stream untouched
  await p.click('.appbar .brand');
  await sleep(300);
  check('after "Don\'t show this again" the logo goes straight through (no explainer)', !(await ev(leaveUp)));
  check('the logo goes to the home page, on the site', await until(homeShown, 5000) && (await ev(`return location.pathname;`)) === '/' && (await ev(`return location.origin;`)) === base);
  check('… the stream keeps playing in the player bar, drawn on the front', await ev(playing) && (await ev(pressed)) === 'true');
  await p.eval(`history.back(); return 1;`);
  check('Back returns to the Listen Live page', await until(pageShown, 5000) && (await ev(`return location.pathname;`)) === '/live');

  // ---- today's schedule and contacts
  // The show on air in today's schedule: the same breathing glow, a pulsing dot, ON AIR clear of the edge.
  const onAirRow = JSON.parse(await p.eval(`var r = document.querySelector('#lvToday .lv-row.now'); if (!r) return JSON.stringify(null);
    r.scrollIntoView({block: 'nearest'}); var t = r.querySelector('.lv-onair'), rr = r.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return JSON.stringify({ breathe: getComputedStyle(r, '::after').animationName, dot: getComputedStyle(t, '::before').animationName, gap: Math.round(rr.right - tr.right) });`));
  check('the on-air row in today\'s schedule breathes, ON AIR has a pulsing dot and room on the right', !!onAirRow && onAirRow.breathe === 'lv-breathe' && onAirRow.dot === 'lv-pulse' && onAirRow.gap >= 10, JSON.stringify(onAirRow));
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
  check('… and the glow goes', await until(`return !document.querySelector('#livePage .lv-player').classList.contains('is-live');`, 3000) && !(await ev(glow)));

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
        // Not drawn (hidden, or display:none as on /live): it covers nothing. Its rect top would be 0.
        var barTop = (barNow.hidden || !barNow.offsetHeight) ? innerHeight : barNow.getBoundingClientRect().top;
        return JSON.stringify({ sideways: document.documentElement.scrollWidth - innerWidth, vol: vis('lvVol'), full: vis('lvFull'), app: vis('lvApp'),
          sched: vis('lvSchedWrap') && getComputedStyle(document.getElementById('lvSchedWrap')).display !== 'none', covered: lastBottom > barTop + 1, lastBottom: lastBottom, barTop: barTop,
          // Wide only: the schedule's Full schedule link is on screen and not covered, scrolled to the
          // bottom of the page (the schedule card is pinned); no contact card reaches under the card.
          // Scrolled to the end of today, as when the card follows the show on air late in the day
          // (Paul's 2026-10-27 screenshot): both the card and its list are scrolled as far as they go.
          fullSched: (function(){ var l = document.querySelector('#lvSchedWrap [data-lv-open="schedule"]'); if(!l || !l.offsetWidth) return null;
            [document.getElementById('lvSchedWrap'), document.getElementById('lvToday')].forEach(function(e){ e.scrollTop = e.scrollHeight; });
            var r = l.getBoundingClientRect(); var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { onScreen: r.top >= 0 && r.bottom <= innerHeight, reachable: !!hit && (hit === l || l.contains(hit)), listScrolls: document.getElementById('lvToday').scrollHeight > document.getElementById('lvToday').clientHeight }; })(),
          under: (function(){ var a = document.getElementById('lvSchedWrap'); if(!a.offsetWidth) return []; var left = a.getBoundingClientRect().left;
            return [...document.querySelectorAll('#lvContacts .lv-contact, #lvSignals')].filter(function(c){ return c.offsetWidth && c.getBoundingClientRect().right > left; }).map(function(c){ return c.textContent.trim().slice(0, 24); }); })() });`));
      const tag = `${label} ${width} ${theme}`;
      // The phone strip (Paul, 2026-10-28): scrolled to the end (above), it shows on one-column
      // widths with the page's state; at the top, and on desktop, it never does.
      // On these fixtures the page is barely taller than a phone screen, so even at the end the
      // page's player is still in view (and the strip rightly hidden). A longer page (a long day's
      // schedule, larger text, the fund drive) is made with a test-only spacer (CSSOM: the CSP
      // voids style=""), then scrolled to the end.
      await p.eval(`var t = document.createElement('div'); t.id = '__tall'; t.style.height = '1400px'; document.getElementById('livePage').appendChild(t);
        window.scrollTo(0, document.documentElement.scrollHeight); return 1;`);
      const oneCol = width < 900;
      if (oneCol) await until(`return !document.getElementById('lvStrip').hidden;`, 3000);
      else await sleep(400);
      const strip = JSON.parse(await p.eval(`var s = document.getElementById('lvStrip'), r = s.getBoundingClientRect(), h = document.querySelector('.appbar').getBoundingClientRect();
        return JSON.stringify({ shown: !s.hidden && s.offsetHeight > 0, inHeader: r.top >= h.top && r.bottom <= h.bottom + 1, title: document.getElementById('lvStripTitle').textContent,
          label: document.getElementById('lvStripPlay').getAttribute('aria-label'),
          scrollY: Math.round(scrollY), docH: document.documentElement.scrollHeight, innerH: innerHeight,
          playerBottom: Math.round(document.querySelector('#livePage .lv-player').getBoundingClientRect().bottom),
          headBottom: Math.round(document.querySelector('.appbar-inner').getBoundingClientRect().bottom) });`));
      check(`${tag}: scrolled down, the live strip ${oneCol ? 'shows under the header, named, with Play' : 'does not show'}`,
        oneCol ? strip.shown && strip.inHeader && strip.title.length > 1 && /Play the live stream/.test(strip.label) : !strip.shown, JSON.stringify(strip));
      if (oneCol && strip.shown && label === 'iPhone' && theme === 'light') {
        await p.clickInPlace('#lvStripPlay');
        check(`${tag}: the strip's Play starts the stream (the page's Play agrees)`, await until(`return document.getElementById('lvStripPlay').getAttribute('aria-pressed') === 'true' && document.getElementById('lvPlay').getAttribute('aria-pressed') === 'true';`, 8000));
        await p.clickInPlace('#lvStripPlay');
        await until(`return document.getElementById('lvPlay').getAttribute('aria-pressed') === 'false';`, 5000);
        // The explainer on a phone (shown again: "don't show" cleared): on screen, full-size buttons.
        await p.eval(`Object.keys(localStorage).filter(function(k){ return /liveleavehint$/.test(k); }).forEach(function(k){ localStorage.removeItem(k); }); return 1;`);
        await p.click('#lvShow');
        await until(leaveUp, 3000);
        const card = JSON.parse(await p.eval(`var r = document.getElementById('lvLeave').getBoundingClientRect(), g = document.getElementById('lvLeaveGo').getBoundingClientRect();
          return JSON.stringify({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, goH: g.height });`));
        const edge = await ev(`var d = document.getElementById('lvLeave'); document.documentElement.dataset.theme = 'dark'; var c = getComputedStyle(d).borderTopColor, w = getComputedStyle(d).borderTopWidth; document.documentElement.dataset.theme = 'light'; return c + ' ' + w;`);
        const alpha = parseFloat((/rgba\([^)]*,\s*([\d.]+)\)/.exec(edge) || [])[1] || '1');
        check(`${tag}: in dark mode the explainer's border stands out (alpha ≥ 0.3, 2px)`, alpha >= 0.3 && /2px/.test(edge), edge);
        check(`${tag}: the explainer fits the phone screen, buttons full size`, card.left >= 8 && card.right <= card.w - 8 && card.top >= 0 && card.bottom <= card.h && card.goH >= 44, JSON.stringify(card));
        await p.clickInPlace('#lvLeaveStay');
        await until(`return !document.getElementById('lvLeave').open;`, 3000);
        await p.eval(`window.scrollTo(0, document.documentElement.scrollHeight); return 1;`);
        await sleep(300);
        await p.clickInPlace('#lvStripInfo');
        check(`${tag}: tapping the strip's name returns to the top, and the strip goes`, await until(`return window.scrollY < 5 && document.getElementById('lvStrip').hidden;`, 4000),
          await ev(`return window.scrollY + ' ' + document.getElementById('lvStrip').hidden;`));
      }
      if (oneCol) {
        await p.eval(`window.scrollTo(0, 0); return 1;`);
        check(`${tag}: at the top, no strip (the page's own player is in view)`, await until(`return document.getElementById('lvStrip').hidden;`, 3000));
      }
      await p.eval(`var t = document.getElementById('__tall'); if (t) t.remove(); return 1;`);
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
        // The schedule's header must stand out from the PAGE around the card, not just differ from the
        // card (2026-10-29: a grey band passed that and still melted into the light page). Measured:
        // the card's top edge against the page behind it, the kicker, the date as a heading, the pill.
        const head = JSON.parse(await p.eval(`
          function rgb(c){ if(!/^rgba?[(]/.test(c)) return null; var v = c.replace(/[^0-9.,]/g, '').split(',').map(parseFloat); return v.length > 3 && v[3] === 0 ? null : v; }
          function lum(v){ return [0,1,2].map(function(i){ var x = v[i]/255; return x <= .03928 ? x/12.92 : Math.pow((x+.055)/1.055, 2.4); }).reduce(function(a,x,i){ return a + x*[.2126,.7152,.0722][i]; }, 0); }
          function ratio(a, b){ var x = lum(a), y = lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
          function behind(el){ for(var e = el.parentElement; e; e = e.parentElement){ var c = rgb(getComputedStyle(e).backgroundColor); if(c) return c; } return [255,255,255]; }
          var c = document.getElementById('lvSchedWrap'), cs = getComputedStyle(c), title = c.querySelector('h2'), date = document.getElementById('lvSchedHead');
          var kick = title && title.querySelector('.lv-sh-kicker'), pill = c.querySelector('[data-lv-open="schedule"]'), page = behind(c);
          var edge = rgb(cs.borderTopColor);
          return JSON.stringify({ edgePx: parseFloat(cs.borderTopWidth), edgeVsPage: edge ? +ratio(edge, page).toFixed(2) : 0,
            gap: Math.round(title.getBoundingClientRect().top - c.getBoundingClientRect().top),
            dateText: date.textContent, datePx: parseFloat(getComputedStyle(date).fontSize), dateWeight: +getComputedStyle(date).fontWeight,
            kicker: kick ? kick.textContent : '', kickerIsAccent: !!kick && getComputedStyle(kick).color === getComputedStyle(document.querySelector('.lv-tag')).color,
            pillRadius: pill ? parseFloat(getComputedStyle(pill).borderTopLeftRadius) : 0, pillBorder: pill ? parseFloat(getComputedStyle(pill).borderTopWidth) : 0 });`));
        check(`${tag}: the schedule card's top edge stands out from the page behind it (≥ 2px, contrast ≥ 3:1)`, head.edgePx >= 2 && head.edgeVsPage >= 3, JSON.stringify(head));
        check(`${tag}: the schedule header is a title — red kicker like LIVE, the date as a bold heading, at the card's top`,
          /^Today on /.test(head.kicker) && head.kickerIsAccent && /\w+day, \w+ \d+/.test(head.dateText) && head.datePx >= 18 && head.dateWeight >= 600 && head.gap <= 20, JSON.stringify(head));
        check(`${tag}: "Full schedule" is a pill button like the page's others`, head.pillRadius >= 15 && head.pillBorder >= 1, JSON.stringify(head));
      }
    }
  }
  // ---- 9: the description folds level with the artwork; the hosts stand out (Paul, 2026-10-30)
  {
    const dir = Array.isArray(arch.directory) ? Object.fromEntries(arch.directory) : arch.directory;
    const [longKey, longInfo] = Object.entries(dir).filter(([, v]) => v.dj && v.desc).sort((a, b) => b[1].desc.length - a[1].desc.length)[0];
    onAirOverride = { ...onAir, altid: longKey, upstreamAltId: longKey.split('.').pop(), name: longInfo.name, dj: longInfo.dj, photo: longInfo.photo || onAir.photo };
    // No button at all (the code before the fold) measures as a hidden one, so it FAILs instead of crashing.
    const fold = `var d = document.getElementById('lvDesc'), b = document.getElementById('lvMore') || document.createElement('button'), a = document.getElementById('lvArt').getBoundingClientRect();
      var r = d.getBoundingClientRect(), br = b.getBoundingClientRect(), lh = parseFloat(getComputedStyle(d).lineHeight);
      return JSON.stringify({ text: d.textContent.length, cut: d.scrollHeight - d.clientHeight, h: Math.round(r.height), descBottom: Math.round(r.bottom), artBottom: Math.round(a.bottom),
        btnShown: !b.hidden && b.offsetHeight > 0, btnBottom: Math.round(br.bottom), label: b.textContent, expanded: b.getAttribute('aria-expanded'),
        lines: Math.round(d.clientHeight / lh) });`;
    for (const [width, mobile] of [[900, false], [1280, false], [1440, false], [390, true]]) {
      await size(width, mobile);
      await p.send('Page.navigate', { url: base + '/live' });
      await until(ready, 30000);
      await until(`return document.getElementById('lvTitle').textContent === ${JSON.stringify(longInfo.name)};`, 15000);
      await sleep(600);
      const tag = `fold ${width}${mobile ? ' phone' : ''}`;
      const f = JSON.parse(await p.eval(fold));
      check(`${tag}: the long description (${longInfo.name}, ${longInfo.desc.length} chars) is folded, with Show more`,
        f.text > 0 && f.cut > 20 && f.btnShown && f.label === 'Show more' && f.expanded === 'false', JSON.stringify(f));
      if (mobile) check(`${tag}: under the artwork it stops at four lines`, f.lines === 4, JSON.stringify(f));
      else check(`${tag}: beside the artwork it ends level with the artwork's bottom, Show more included`,
        f.btnBottom <= f.artBottom + 2 && f.btnBottom >= f.artBottom - 40, JSON.stringify(f));
      await p.clickInPlace('#lvMore');
      await sleep(300);
      const o = JSON.parse(await p.eval(fold));
      check(`${tag}: Show more opens all of it (Show less, expanded)`, o.cut <= 1 && o.label === 'Show less' && o.expanded === 'true' && o.h > f.h, JSON.stringify(o));
      // Opened, Show less sits further down: scroll to it, as a listener would.
      await p.eval(`document.getElementById('lvMore').scrollIntoView({ block: 'center' }); return 1;`);
      await sleep(200);
      await p.clickInPlace('#lvMore');
      await sleep(300);
      const c = JSON.parse(await p.eval(fold));
      check(`${tag}: Show less folds it again`, c.cut > 20 && c.label === 'Show more' && c.h === f.h, JSON.stringify(c));
      if (width === 1280) {
        const h = JSON.parse(await p.eval(`var s = document.getElementById('lvSub'), h = s.querySelector('.lv-host'), hs = h && getComputedStyle(h), ss = getComputedStyle(s);
          return JSON.stringify({ host: h ? h.textContent : null, weight: hs ? +hs.fontWeight : 0, color: hs ? hs.color : '', subColor: ss.color, sub: s.textContent });`));
        check(`${tag}: the hosts are bold, in a colour of their own`, h.host === longInfo.dj && h.weight >= 700 && h.color !== h.subColor && h.sub.indexOf('with ' + longInfo.dj) === 0, JSON.stringify(h));
      }
    }
    // A show with a short description gets no button.
    const [shortKey, shortInfo] = Object.entries(dir).filter(([, v]) => v.desc && v.desc.length > 20 && v.desc.length < 120)[0] || [];
    if (shortKey) {
      onAirOverride = { ...onAir, altid: shortKey, upstreamAltId: shortKey.split('.').pop(), name: shortInfo.name, dj: shortInfo.dj || '', photo: shortInfo.photo || onAir.photo };
      await size(1280, false);
      await p.send('Page.navigate', { url: base + '/live' });
      await until(ready, 30000);
      await until(`return document.getElementById('lvTitle').textContent === ${JSON.stringify(shortInfo.name)};`, 15000);
      await sleep(600);
      const s2 = JSON.parse(await p.eval(fold));
      check(`fold 1280: a short description (${shortInfo.name}) shows whole, with no Show more`, s2.cut <= 1 && !s2.btnShown && s2.text > 0, JSON.stringify(s2));
    } else check('fold: a show with a short description exists to test', false, 'none in the directory');
    onAirOverride = null;
  }
  await p.send('Fetch.disable');
  check('no uncaught errors anywhere in the run', !errors.length, errors.slice(0, 3).join('\n     '));
  await p.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: safariRule });
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
