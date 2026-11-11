// The podcast player embed and the studio's Embeds tab (2026-11-11), real taps in Chrome on a
// scratch server (run.sh):
//  1. The player at /embed/podcasts: loads the site's feed, Radio Suite's look (fonts, black and
//     white), play from a row, the bar (pause, speed, skip), plays on to the next episode, close,
//     the show picker by mouse and keyboard, the light/dark button.
//  2. Settings in the link: theme, show, latest N oldest first, parts hidden, accent colours, an
//     episode opened without autoplay, a show that is not there.
//  3. Phone widths (320, 375), light and dark, with the bar open: nothing sideways, nothing cut off.
//  4. Another website (a different origin) frames the player; the fund drive capsule refuses it.
//  1b. Bigger play/pause icons; Show info and Transcript overlays over the list with the player bar
//      still usable; the transcript follows the audio, a tap on a line plays from there. QIR is not
//      reachable from a laptop, so Chrome answers the notes and transcript requests with a stand-in.
//  5. The studio's Embeds tab: the code follows every setting, the preview is the real player,
//     Phone preview, Reset; three tabs fit on a phone.
// It plays real episodes from the station's audio host (muted Chrome), so it needs the internet.
const http = require('http');
const { connect, sleep } = require('../live-stream/cdp.js');
const base = (process.env.APP || 'http://127.0.0.1:8094/').replace(/\/$/, '');
const password = process.env.STUDIO_PW || 'pw';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9235);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0;
  const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '\n     ' + detail)); if (!ok) failed++; };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(200); } return false; };
  // A failed page eval is FALSE (and printed), never a truthy error string (CLAUDE.md §3a.6).
  const ev = js => p.eval(js).catch(e => { console.log('     (page eval failed: ' + String(e.message).slice(0, 200) + ')'); return false; });
  const evJson = async js => { const r = await ev(js); try { return r ? JSON.parse(r) : {}; } catch { return {}; } };
  let errors = [];
  p.on(m => {
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(((d.exception && d.exception.description) || d.text).split('\n')[0]); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value || a.description).join(' '));
  });
  const size = async (width, height, mobile) => {
    await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: !!mobile });
    await p.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  };
  const go = async (path) => { await p.send('Page.navigate', { url: path.startsWith('http') ? path : base + path }); await sleep(300); await until(`return document.readyState === 'complete';`, 20000); };
  const key = async (k) => {
    const code = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27 }[k];
    await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code });
    await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
  };
  const listed = `document.querySelectorAll('.pe-episode').length > 0`;
  const AUDIO = `document.querySelector('.pe audio')`;
  const bar = `document.querySelector('.pe-player')`;
  const noSideways = `(function(){ var w = innerWidth, wide = [].filter.call(document.querySelectorAll('.pe *'), function (n) { var r = n.getBoundingClientRect(); return r.width > 0 && (r.right > w + 0.5 || r.left < -0.5) && !n.closest('.pe-dropdown-list'); });
    return { page: document.documentElement.scrollWidth <= w, cut: wide.slice(0, 3).map(function (n) { return n.className; }) }; })()`;

  // ---- 1: the player
  await size(1280, 720, false);
  await go('/embed/podcasts');
  check('the player loads the site\'s feed and lists a show\'s episodes', await until(`return ${listed};`, 20000));
  const first = await evJson(`var a = fetch('/api/archive').then(function (r) { return r.json(); }); return a.then(function (j) {
    var shows = PodcastEmbed.orderShows(PodcastEmbed.showsFromArchive(j), 'alphabetical');
    return JSON.stringify({ count: shows.length, title: shows[0].title, second: shows[1].title, episodes: shows[0].episodes.length, secondKey: shows[1].key,
      big: shows.filter(function (s) { return s.episodes.length >= 8; })[0].key }); });`);
  const page = await evJson(`return JSON.stringify({ header: document.querySelector('.pe-title span').textContent, show: document.querySelector('.pe-show-title').textContent,
    picker: document.querySelector('.pe-dropdown-text').textContent, rows: document.querySelectorAll('.pe-episode').length, theme: document.getElementById('player').getAttribute('data-theme'),
    options: document.querySelectorAll('.pe-option').length });`);
  check('… header says the station, the picker starts on the first show A to Z, every episode listed',
    page.header === 'KPFK' && page.show === first.title && page.picker === first.title && page.rows === first.episodes && page.options === first.count && page.theme === 'dark', JSON.stringify({ page, first }));
  await until(`var i = document.querySelector('img.pe-show-cover'); return !!i && i.complete && i.naturalWidth > 0;`, 10000);   // the picture loads lazily
  const look = await evJson(`return document.fonts.ready.then(function () { var b = document.querySelector('.pe-play-btn'), img = document.querySelector('.pe-show-cover');
    return JSON.stringify({ oswald: document.fonts.check('600 22px Oswald'), inter: document.fonts.check('400 14px Inter'),
      loaded: Array.from(document.fonts).map(function (f) { return f.family.replace(/"/g, '') + ':' + f.status; }).join(','),
      titleFont: getComputedStyle(document.querySelector('.pe-show-title')).fontFamily.split(',')[0].replace(/"/g, ''),
      playBg: getComputedStyle(b).backgroundColor, playInk: getComputedStyle(b).color, bg: getComputedStyle(document.body).backgroundColor,
      cover: img && img.tagName === 'IMG' ? (img.complete && img.naturalWidth > 0 ? 'drawn' : 'not drawn') : 'placeholder', icon: !!b.querySelector('svg.pe-ic') }); });`);
  check('… Radio Suite\'s look: Oswald and Inter loaded from this site, black and white (light grey button, black icon), artwork drawn',
    /Oswald:loaded/.test(look.loaded) && /Inter:loaded/.test(look.loaded) && look.titleFont === 'Oswald' && look.playBg === 'rgb(229, 231, 235)' && look.playInk === 'rgb(0, 0, 0)'
    && look.bg === 'rgb(10, 10, 10)' && look.cover === 'drawn' && look.icon, JSON.stringify(look));
  check('… nothing plays and no player bar before a tap', await ev(`return ${bar}.hidden && ${bar}.offsetHeight === 0 && ${AUDIO}.paused && !${AUDIO}.getAttribute('src');`));

  await p.click('.pe-episode:nth-child(1) .pe-play-btn');
  check('a tap on a row\'s Play: sound starts', await until(`return !${AUDIO}.paused && ${AUDIO}.currentTime > 0.3;`, 25000), await ev(`return 'paused ' + ${AUDIO}.paused + ' t ' + ${AUDIO}.currentTime + ' err ' + (${AUDIO}.error && ${AUDIO}.error.code);`));
  const playing = await evJson(`var r = document.querySelector('.pe-episode:nth-child(1)'), b = ${bar}.getBoundingClientRect();
    return JSON.stringify({ bar: !${bar}.hidden && b.height > 40 && Math.abs(b.bottom - innerHeight) <= 1, title: document.querySelector('.pe-player-title').textContent, rowTitle: r.querySelector('.pe-episode-title').textContent,
      show: document.querySelector('.pe-player-show').textContent, current: r.classList.contains('is-current'), rowLabel: r.querySelector('.pe-play-btn').getAttribute('aria-label'),
      rowIcon: r.querySelector('.pe-play-btn').dataset.icon, barLabel: document.querySelector('.pe-ctrl--play').getAttribute('aria-label'), src: ${AUDIO}.currentSrc, end: document.querySelector('.pe-times span:last-child').textContent });`);
  check('… the bar sits at the bottom with the episode and show; the row is marked and its button is Pause',
    playing.bar && playing.title === playing.rowTitle && playing.show === first.title && playing.current && /^Pause /.test(playing.rowLabel) && playing.rowIcon === 'pause' && playing.barLabel === 'Pause'
    && /^https:\/\/archive\.kpfk\.org\//.test(playing.src) && /^\d+:\d\d/.test(playing.end) && playing.end !== '0:00', JSON.stringify(playing));
  await p.click('.pe-ctrl--play');
  check('… the bar\'s Pause pauses; the row goes back to Play', await until(`return ${AUDIO}.paused && document.querySelector('.pe-episode:nth-child(1) .pe-play-btn').dataset.icon === 'play' && document.querySelector('.pe-ctrl--play').getAttribute('aria-label') === 'Play';`, 5000));
  await p.click('.pe-episode:nth-child(1) .pe-play-btn');
  check('… the same row\'s Play resumes (it does not start over)', await until(`return !${AUDIO}.paused && ${AUDIO}.currentTime > 0.3;`, 15000));

  await p.click('.pe-speed .pe-ctrl--text');
  check('speed: the menu opens above the button', await ev(`var m = document.querySelector('.pe-speed-menu'), r = m.getBoundingClientRect(); return !m.hidden && r.height > 80 && r.top >= 0 && m.querySelectorAll('button').length === 5;`));
  await p.click('.pe-speed-menu button:nth-child(4)');
  check('… 1.5x: the audio runs at 1.5, the button says so, the menu closes', await ev(`return ${AUDIO}.playbackRate === 1.5 && document.querySelector('.pe-speed .pe-ctrl--text').textContent === '1.5x' && document.querySelector('.pe-speed-menu').hidden;`));
  const before = await ev(`return ${AUDIO}.currentTime;`);
  await p.click('.pe-controls > button:nth-of-type(3)');   // back, play, forward
  const after = await ev(`return ${AUDIO}.currentTime;`);
  check('… Forward 30 seconds moves on about 30 s', after - before >= 29 && after - before <= 36, `${before} -> ${after}`);

  // Plays on: jump close to the end and wait for the next row to take over (same speed).
  const hasNext = first.episodes > 1;
  if (hasNext) {
    await until(`return isFinite(${AUDIO}.duration) && ${AUDIO}.duration > 60;`, 15000);
    await ev(`${AUDIO}.currentTime = ${AUDIO}.duration - 2; return 1;`);
    const moved = await until(`var r = document.querySelector('.pe-episode:nth-child(2)'); return r.classList.contains('is-current') && document.querySelector('.pe-player-title').textContent === r.querySelector('.pe-episode-title').textContent;`, 40000);
    check('at the end it plays on to the next episode in the list', moved && await until(`return !${AUDIO}.paused && ${AUDIO}.currentTime > 0.3;`, 25000),
      await ev(`return 'title ' + document.querySelector('.pe-player-title').textContent + ' paused ' + ${AUDIO}.paused + ' t ' + ${AUDIO}.currentTime;`));
    check('… still at 1.5x, and the first row is no longer marked', await ev(`return ${AUDIO}.playbackRate === 1.5 && !document.querySelector('.pe-episode:nth-child(1)').classList.contains('is-current');`));
  }
  await p.click('.pe-player-close');
  check('Close: the bar goes, the sound stops, no error message', await ev(`return ${bar}.hidden && ${AUDIO}.paused && !${AUDIO}.getAttribute('src') && document.querySelector('.pe-toast').hidden && !document.querySelector('.pe-episode.is-current');`));

  // The show picker: mouse, then keyboard.
  await p.click('.pe-dropdown-btn');
  check('the show picker opens a list of every show, the current one marked', await ev(`var l = document.querySelector('.pe-dropdown-list'); return !l.hidden && l.offsetHeight > 100 && document.querySelector('.pe-option.is-selected .pe-option-title').textContent === ${JSON.stringify(first.title)}
    && document.querySelector('.pe-dropdown-btn').getAttribute('aria-expanded') === 'true';`));
  await key('ArrowDown'); await key('Enter');
  check('… Arrow down, Enter: the next show opens, the list closes', await until(`return document.querySelector('.pe-show-title').textContent === ${JSON.stringify(first.second)} && document.querySelector('.pe-dropdown-list').hidden
    && document.querySelector('.pe-dropdown-text').textContent === ${JSON.stringify(first.second)} && ${listed};`, 5000), await ev(`return document.querySelector('.pe-show-title').textContent;`));
  // Paul, 2026-11-11: a different show closes the player (stopped if playing, bar removed).
  await p.click('.pe-episode:nth-child(1) .pe-play-btn');
  await until(`return !${AUDIO}.paused && ${AUDIO}.currentTime > 0.3;`, 25000);
  await p.click('.pe-dropdown-btn'); await key('Enter');
  check('… the same show again: the episode plays on', await ev(`return !${AUDIO}.paused && !${bar}.hidden;`));
  await p.click('.pe-dropdown-btn');
  await p.click('.pe-option:nth-child(1)');
  check('… another show while playing: the sound stops and the player bar is removed', await until(`return document.querySelector('.pe-show-title').textContent === ${JSON.stringify(first.title)}
    && ${AUDIO}.paused && !${AUDIO}.getAttribute('src') && ${bar}.hidden && ${bar}.offsetHeight === 0 && !document.querySelector('.pe-episode.is-current');`, 5000));
  await p.click('.pe-episode:nth-child(1) .pe-play-btn');
  await until(`return !${AUDIO}.paused;`, 25000);
  await p.click('.pe-ctrl--play');
  await until(`return ${AUDIO}.paused;`, 3000);
  await p.click('.pe-dropdown-btn'); await key('ArrowDown'); await key('Enter');
  check('… another show while paused: the player bar is removed too', await until(`return document.querySelector('.pe-show-title').textContent === ${JSON.stringify(first.second)} && ${bar}.hidden && !${AUDIO}.getAttribute('src');`, 5000));
  await p.click('.pe-dropdown-btn'); await key('Escape');
  check('… Escape closes it without changing the show', await ev(`return document.querySelector('.pe-dropdown-list').hidden && document.querySelector('.pe-show-title').textContent === ${JSON.stringify(first.second)};`));
  await p.click('.pe-dropdown-btn');
  await p.click('.pe-option:nth-child(1)');
  check('… a tap on a show in the list opens it', await until(`return document.querySelector('.pe-show-title').textContent === ${JSON.stringify(first.title)} && document.querySelector('.pe-dropdown-list').hidden;`, 5000));

  await p.click('.pe-header .pe-icon-btn');
  const lit = await evJson(`var b = document.querySelector('.pe-play-btn'); return JSON.stringify({ theme: document.getElementById('player').getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor,
    playBg: getComputedStyle(b).backgroundColor, playInk: getComputedStyle(b).color, label: document.querySelector('.pe-header .pe-icon-btn').getAttribute('aria-label') });`);
  check('the light/dark button: light page, near-black button with a white icon', lit.theme === 'light' && lit.bg === 'rgb(253, 252, 255)' && lit.playBg === 'rgb(24, 24, 27)' && lit.playInk === 'rgb(255, 255, 255)' && lit.label === 'Switch to dark theme', JSON.stringify(lit));
  check('the player page: no uncaught errors so far', !errors.length, errors.slice(0, 3).join('\n     '));

  // ---- 1b: icons, Show info, Transcript (QIR answered by a stand-in inside Chrome)
  errors = [];
  await go('/embed/podcasts');
  await until(`return ${listed};`, 20000);
  const fx = await evJson(`return fetch('/api/archive').then(function (r) { return r.json(); }).then(function (j) {
    var s = PodcastEmbed.orderShows(PodcastEmbed.showsFromArchive(j), 'alphabetical')[0], d = j.directory[s.key] || {};
    var eps = PodcastEmbed.episodesToShow(s.episodes, 'newest', null);
    return JSON.stringify({ key: s.key, desc: s.description, eps: eps.slice(0, 2).map(function (e) { return { id: e.id, duration: e.duration, title: e.title }; }) }); });`);
  const QIR1 = 'ba7691fd-c65e-4b47-b80a-fe9057c7809d', QIR2 = 'ca7691fd-c65e-4b47-b80a-fe9057c7809d';
  const step = Math.max(2, Math.floor(Math.min(fx.eps[0].duration || 600, 3000) / 52));
  const hms = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60; return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':') + '.000'; };
  const vtt = 'WEBVTT\n\n' + Array.from({ length: 50 }, (_, i) => `${hms(i * step)} --> ${hms((i + 1) * step)}\nLine ${i + 1} of the stand-in transcript, long enough to wrap on a phone screen.`).join('\n\n');
  let qirMode = 'fixture';
  const qirAsked = [];
  p.on(async m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const url = m.params.request.url, id = m.params.requestId;
    qirAsked.push(url.replace(/^https?:\/\/[^/]+/, ''));
    const answer = (status, body) => p.send('Fetch.fulfillRequest', { requestId: id, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') }).catch(() => {});
    if (qirMode === 'none') return answer(404, { error: 'plugin_disabled' });
    if (url.includes('/api/plugins/qir/notes')) return answer(200, { provider: 'qir', station: 'kpfk', stale: false, pending: {}, show: fx.key, notes: {
      [fx.eps[0].id]: { qir: QIR1, headline: 'Stand-in headline for the test', summary: 'Stand-in summary.', host: '', guest: '' },
      [fx.eps[1].id]: { qir: QIR2, headline: '', summary: '', host: '', guest: '' } } });
    if (url.includes('/transcript/' + QIR1)) return answer(200, { vtt, transcript: '', language: 'en' });
    if (url.includes('/transcript/' + QIR2)) return answer(404, { error: 'not_found' });
    return answer(404, { error: 'not_found' });
  });
  await p.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/plugins/qir/*', requestStage: 'Request' }] });
  await go('/embed/podcasts');
  await until(`return ${listed};`, 20000);
  check('QIR\'s notes for the shown show only: the headline becomes the title, Transcript buttons where QIR has one',
    await until(`var r = document.querySelectorAll('.pe-episode'); return r[0].querySelector('.pe-episode-title').textContent === 'Stand-in headline for the test' && !!r[0].querySelector('.pe-transcript-btn') && !!r[1].querySelector('.pe-transcript-btn') && !(r[2] && r[2].querySelector('.pe-transcript-btn'));`, 8000)
    && qirAsked.filter(u => u.indexOf('/notes') >= 0).every(u => u === '/api/plugins/qir/notes?show=' + encodeURIComponent(fx.key)), qirAsked.join(' '));
  const icons = await evJson(`var row = document.querySelector('.pe-play-btn'), ri = row.querySelector('svg').getBoundingClientRect(), rb = row.getBoundingClientRect();
    return JSON.stringify({ row: Math.round(ri.width), rowBox: Math.round(rb.width) });`);
  check('play icons fill their buttons: about 22px in the 38px row button', icons.row >= 21 && icons.row / icons.rowBox >= 0.55, JSON.stringify(icons));

  // Start something so the bar is up, then open Show info over the list.
  await p.click('.pe-episode:nth-child(1) .pe-play-btn');
  await until(`return !${AUDIO}.paused && ${AUDIO}.currentTime > 0.3;`, 25000);
  const barIcon = await evJson(`var b = document.querySelector('.pe-ctrl--play'), i = b.querySelector('svg').getBoundingClientRect(); return JSON.stringify({ icon: Math.round(i.width), box: Math.round(b.getBoundingClientRect().width) });`);
  check('… about 26px in the bar\'s 44px button', barIcon.icon >= 25 && barIcon.icon / barIcon.box >= 0.55, JSON.stringify(barIcon));
  await p.click('.pe-pill-btn');
  const info = await evJson(`var l = document.querySelector('.pe-layer'), sh = document.querySelector('.pe-sheet'), all = document.querySelector('.pe-link--primary');
    var b = document.querySelector('.pe-ctrl--play').getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    var stage = document.querySelector('.pe-stage').getBoundingClientRect(), r = sh.getBoundingClientRect(), bar = ${bar}.getBoundingClientRect();
    return JSON.stringify({ open: !l.hidden, kind: document.querySelector('.pe-sheet-kind').textContent, title: document.querySelector('.pe-sheet-title').textContent, show: document.querySelector('.pe-show-title').textContent,
      desc: (document.querySelector('.pe-info-desc') || {}).textContent, all: all && all.getAttribute('href'), allTarget: all && all.target, focus: document.activeElement === document.querySelector('.pe-sheet-head .pe-icon-btn'),
      barReachable: !!hit && !!hit.closest('.pe-ctrl--play'), aboveBar: r.bottom <= bar.top + 0.5 && r.top >= stage.top - 0.5, inert: document.querySelector('.pe-main').inert, dialog: sh.getAttribute('role') });`);
  check('Show info opens over the list, not the player bar: the whole description, a link to the show on the site, focus on Close',
    info.open && info.kind === 'Show info' && info.title === info.show && info.desc === (fx.desc || 'No description for this show yet.') && info.all === new URL(base).origin + '/show/' + encodeURIComponent(fx.key.split('.').pop())
    && info.allTarget === '_blank' && info.focus && info.barReachable && info.aboveBar && info.inert === true && info.dialog === 'dialog', JSON.stringify(info));
  await p.click('.pe-ctrl--play');
  check('… the bar\'s Pause works with the overlay open, and the overlay stays', await until(`return ${AUDIO}.paused && !document.querySelector('.pe-layer').hidden;`, 3000));
  await key('Escape');
  check('… Escape closes it; focus back on Show info; the list takes taps again', await until(`return document.querySelector('.pe-layer').hidden && document.activeElement === document.querySelector('.pe-pill-btn') && !document.querySelector('.pe-main').inert;`, 3000));

  // Transcript of the episode in the bar
  await p.click('.pe-episode:nth-child(1) .pe-transcript-btn');
  check('Transcript opens: its lines with times', await until(`return document.querySelectorAll('.pe-sheet .pe-line').length === 50;`, 8000)
    && (await ev(`return document.querySelector('.pe-sheet-kind').textContent + ' | ' + document.querySelector('.pe-sheet-title').textContent + ' | ' + document.querySelector('.pe-line .pe-line-time').textContent;`)) === 'Transcript | Stand-in headline for the test | 0:00');
  const target = 30, at = target * step;
  await ev(`var b = document.querySelectorAll('.pe-line')[${target}]; var body = document.querySelector('.pe-sheet-body'); body.scrollTop = b.parentNode.offsetTop - 40; return 1;`);
  await sleep(300);
  await p.clickInPlace(`.pe-transcript li:nth-child(${target + 1}) .pe-line`);
  check('… a tap on a line plays from there', await until(`return !${AUDIO}.paused && ${AUDIO}.currentTime >= ${at} - 0.5 && ${AUDIO}.currentTime < ${at} + ${step} + 3;`, 25000), await ev(`return ${AUDIO}.currentTime + ' paused ' + ${AUDIO}.paused;`));
  check('… and that line is marked as now, in view', await until(`var n = document.querySelector('.pe-line.is-now'), body = document.querySelector('.pe-sheet-body'); if (!n) return false;
    var r = n.getBoundingClientRect(), br = body.getBoundingClientRect(); return n === document.querySelectorAll('.pe-line')[${target}] && r.top >= br.top && r.bottom <= br.bottom;`, 8000));
  // A scroll by hand stops the following; Back to now brings it back.
  const bodyBox = await evJson(`var r = document.querySelector('.pe-sheet-body').getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });`);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: bodyBox.x, y: bodyBox.y, deltaX: 0, deltaY: -1500 });
  check('… scrolling by hand stops the following: Back to now appears', await until(`var b = document.querySelector('.pe-now-btn'); return !!b && !b.hidden;`, 3000));
  await p.click('.pe-now-btn');
  check('… Back to now: the current line is in view again', await until(`var n = document.querySelector('.pe-line.is-now'), body = document.querySelector('.pe-sheet-body'); if (!n) return false;
    var r = n.getBoundingClientRect(), br = body.getBoundingClientRect(); return document.querySelector('.pe-now-btn').hidden && r.top >= br.top && r.bottom <= br.bottom;`, 4000));
  await p.click('.pe-ctrl--play');
  await until(`return ${AUDIO}.paused;`, 3000);
  await p.click('.pe-sheet-head .pe-icon-btn');
  check('… Close closes it; the episode is still in the bar', await until(`return document.querySelector('.pe-layer').hidden && !${bar}.hidden;`, 3000));
  // An episode QIR has no transcript for yet: the site's words, no error
  await p.click('.pe-episode:nth-child(2) .pe-transcript-btn');
  check('a transcript QIR does not have: "There is no transcript for this episode yet."', await until(`var e = document.querySelector('.pe-sheet-body .pe-empty p'); return !!e && e.textContent === 'There is no transcript for this episode yet.';`, 8000));
  await ev(`var l = document.querySelector('.pe-layer').getBoundingClientRect(); return 1;`);
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  check('… a tap outside the card closes it', await until(`return document.querySelector('.pe-layer').hidden;`, 3000));
  // Phone: the overlay fills the space above the bar; the bar stays in sight and in reach
  await size(320, 640, true);
  await go('/embed/podcasts?episode=' + encodeURIComponent(fx.eps[0].id));
  await until(`return ${listed} && !!document.querySelector('.pe-transcript-btn');`, 15000);
  await p.click('.pe-episode.is-current .pe-transcript-btn');
  await until(`return document.querySelectorAll('.pe-sheet .pe-line').length === 50;`, 8000);
  const ph = await evJson(`var sh = document.querySelector('.pe-sheet').getBoundingClientRect(), bar = ${bar}.getBoundingClientRect(), f = ${noSideways}, b = document.querySelector('.pe-ctrl--play').getBoundingClientRect(),
    hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return JSON.stringify({ fills: sh.left === 0 && Math.round(sh.width) === innerWidth, above: sh.bottom <= bar.top + 0.5, barShown: bar.height > 60 && Math.abs(bar.bottom - innerHeight) <= 1, reach: !!hit && !!hit.closest('.pe-ctrl--play'), page: f.page, cut: f.cut });`);
  check('320px: the transcript fills the space above the bar; the bar stays in sight and in reach; nothing sideways', ph.fills && ph.above && ph.barShown && ph.reach && ph.page && !ph.cut.length, JSON.stringify(ph));
  await size(1280, 720, false);
  // A station without transcripts (Discovery or QIR off: 404): no buttons, no error
  qirMode = 'none';
  await go('/embed/podcasts');
  await until(`return ${listed};`, 20000);
  await sleep(800);
  check('no transcripts on the station: no Transcript buttons, the headline stays the feed\'s', await ev(`return !document.querySelector('.pe-transcript-btn') && document.querySelector('.pe-episode-title').textContent === ${JSON.stringify(fx.eps[0].title)};`));
  await p.send('Fetch.disable');
  check('overlays and transcripts: no uncaught errors', !errors.length, errors.slice(0, 3).join('\n     '));

  // ---- 2: settings in the link
  errors = [];
  await go(`/embed/podcasts?theme=light&show=${encodeURIComponent(first.big)}&limit=5&sort=oldest&header=false&selector=false&cover=false&dark=ff6b9d&light=00796b`);
  await until(`return ${listed};`, 20000);
  const linked = await evJson(`return fetch('/api/archive').then(function (r) { return r.json(); }).then(function (j) {
    var s = PodcastEmbed.showsFromArchive(j).filter(function (x) { return x.key === ${JSON.stringify(first.big)}; })[0];
    var want = PodcastEmbed.episodesToShow(s.episodes, 'oldest', 5).map(function (e) { return e.title; });
    var b = document.querySelector('.pe-play-btn');
    return JSON.stringify({ header: !!document.querySelector('.pe-header'), picker: !!document.querySelector('.pe-picker'), covers: document.querySelectorAll('.pe img, .pe-cover-placeholder').length,
      theme: document.getElementById('player').getAttribute('data-theme'), show: document.querySelector('.pe-show-title').textContent === s.title,
      rows: [].map.call(document.querySelectorAll('.pe-episode-title'), function (n) { return n.textContent; }), want: want, all: s.episodes.length, playBg: getComputedStyle(b).backgroundColor }); });`);
  check('the link\'s settings: light, that show, its newest five oldest first, no header, picker or covers, the link\'s accent',
    !linked.header && !linked.picker && linked.covers === 0 && linked.theme === 'light' && linked.show && linked.all >= 8 && linked.rows.length === 5 && JSON.stringify(linked.rows) === JSON.stringify(linked.want)
    && linked.playBg === 'rgb(0, 121, 107)', JSON.stringify(linked));
  const epId = await ev(`return fetch('/api/archive').then(function (r) { return r.json(); }).then(function (j) { var s = PodcastEmbed.showsFromArchive(j).filter(function (x) { return x.key === ${JSON.stringify(first.big)}; })[0];
    return PodcastEmbed.episodesToShow(s.episodes, 'newest', null)[6].id; });`);
  await go(`/embed/podcasts?episode=${encodeURIComponent(epId)}`);
  await until(`return ${listed} && !${bar}.hidden;`, 20000);
  await sleep(600);
  const opened = await evJson(`var cur = document.querySelector('.pe-episode.is-current'), m = document.querySelector('.pe-main'), r = cur && cur.getBoundingClientRect(), mr = m.getBoundingClientRect();
    return JSON.stringify({ bar: !${bar}.hidden, paused: ${AUDIO}.paused, time: ${AUDIO}.currentTime, src: !!${AUDIO}.getAttribute('src'), row: !!cur, title: cur && cur.querySelector('.pe-episode-title').textContent === document.querySelector('.pe-player-title').textContent,
      inView: !!r && r.top >= mr.top && r.bottom <= mr.bottom, scrolled: m.scrollTop > 0, pageScroll: scrollY });`);
  check('an episode in the link opens in the bar on its show, scrolled into view, without autoplay', opened.bar && opened.paused && opened.time === 0 && opened.src && opened.row && opened.title && opened.inView && opened.scrolled && opened.pageScroll === 0, JSON.stringify(opened));
  await p.click('.pe-ctrl--play');
  check('… one tap on Play starts it', await until(`return !${AUDIO}.paused && ${AUDIO}.currentTime > 0.3;`, 25000));
  await go('/embed/podcasts?show=kpfk.kpfk.no-such-show&theme=purple&limit=7');
  check('a show that is not there: a plain message, no list, no error', await until(`var e = document.querySelector('.pe-empty p'); return !!e && /no episodes to play/.test(e.textContent) && !document.querySelector('.pe-episode');`, 15000));
  check('link settings: no uncaught errors', !errors.length, errors.slice(0, 3).join('\n     '));

  // ---- 3: phone widths, the bar open, light and dark
  for (const width of [320, 375]) for (const theme of ['dark', 'light']) {
    errors = [];
    await size(width, 640, true);
    await go(`/embed/podcasts?theme=${theme}&episode=${encodeURIComponent(epId)}`);
    await until(`return ${listed} && !${bar}.hidden;`, 20000);
    await sleep(500);
    const fit = await evJson(`var b = ${bar}.getBoundingClientRect(), c = document.querySelector('.pe-controls').getBoundingClientRect(), f = ${noSideways};
      return JSON.stringify({ page: f.page, cut: f.cut, barIn: b.left >= 0 && b.right <= innerWidth + 0.5 && Math.abs(b.bottom - innerHeight) <= 1, controlsIn: c.left >= 0 && c.right <= innerWidth + 0.5,
        stacked: c.top > document.querySelector('.pe-progress').getBoundingClientRect().top, volume: getComputedStyle(document.querySelector('.pe-volume-input')).display, list: document.querySelector('.pe-main').clientHeight });`);
    check(`${width}px ${theme}: nothing sideways or cut off; the bar stacks under the list, which still has room`,
      fit.page && fit.cut && !fit.cut.length && fit.barIn && fit.controlsIn && fit.stacked && fit.volume === 'none' && fit.list > 150 && !errors.length, JSON.stringify(fit) + ' ' + errors.slice(0, 2).join(' '));
  }

  // ---- 4: another website frames it (a different origin); the fund drive capsule refuses that site
  await size(1280, 720, false);
  const code = await ev(`return PodcastEmbed.iframeCode(${JSON.stringify(base)} + '/embed/podcasts?theme=light', '100%', '500', 'KPFK podcast player');`);
  const host = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>Another website</title><h1>Another website</h1>${code}<iframe id="fund" src="${base}/embed/fund-drive?theme=light" width="100%" height="170"></iframe>`);
  });
  await new Promise(r => host.listen(0, '127.0.0.1', r));
  // A refused frame is not in the frame tree; the network record says which page was blocked.
  const asked = new Map(), blocked = [];
  p.on(m => {
    if (m.method === 'Network.requestWillBeSent') asked.set(m.params.requestId, m.params.request.url);
    if (m.method === 'Network.loadingFailed') blocked.push((asked.get(m.params.requestId) || '?') + ' ' + m.params.errorText + ' ' + (m.params.blockedReason || ''));
  });
  await p.send('Network.enable');
  // Another origin (a different port), on the same machine name so Chrome keeps its frames in this
  // page's process, where Page.getFrameTree can see whether each one loaded or was refused.
  await go(`http://127.0.0.1:${host.address().port}/`);
  await sleep(2500);
  const tree = await p.send('Page.getFrameTree');
  const frames = (tree.frameTree.childFrames || []).map(f => f.frame.url + (f.frame.unreachableUrl ? ' (refused: ' + f.frame.unreachableUrl + ')' : ''));
  const playerFrame = frames.filter(u => u.indexOf('/embed/podcasts') >= 0 && u.indexOf('refused') < 0);
  const fundFrame = blocked.filter(u => u.indexOf('/embed/fund-drive') >= 0 && /BLOCKED_BY_RESPONSE|csp/i.test(u));
  await p.send('Network.disable');
  check('another website shows the player in a frame', playerFrame.length === 1 && await ev(`var f = document.querySelector('iframe'); return f.getBoundingClientRect().height === 500 && f.getAttribute('title') === 'KPFK podcast player';`), frames.join(' | '));
  check('… and the same page is refused the fund drive capsule (the check can see a refusal); the player was not blocked',
    fundFrame.length === 1 && !blocked.some(u => u.indexOf('/embed/podcasts') >= 0), 'blocked: ' + blocked.join(' | ') + ' frames: ' + frames.join(' | '));
  await new Promise(r => host.close(r));

  // ---- 5: the studio's Embeds tab
  errors = [];
  await go('/studio');
  await p.eval(`return fetch('/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(password)} }) }).then(r => r.status);`);
  await go('/studio');
  await until(`return !!document.getElementById('tabEmbeds');`, 10000);
  check('the studio has an Embeds tab, closed at first', await ev(`var t = document.getElementById('tabEmbeds'); return !t.hidden && t.offsetHeight > 30 && t.getAttribute('aria-selected') === 'false' && document.getElementById('embedsPanel').hidden && !document.getElementById('emFrame').getAttribute('src');`));
  await p.click('#tabEmbeds');
  check('… a tap opens it: the stats give way, the address says #embeds', await until(`return !document.getElementById('embedsPanel').hidden && document.getElementById('main').hidden && location.hash === '#embeds' && document.getElementById('tabEmbeds').getAttribute('aria-selected') === 'true';`, 5000));
  const site = await ev(`return fetch('/api/studio/embeds').then(function (r) { return r.json(); }).then(function (j) { return j.siteUrl || location.origin; });`);
  const snippet = () => ev(`return document.getElementById('emSnippet').textContent;`);
  await until(`return document.getElementById('emSnippet').textContent.indexOf(${JSON.stringify(site)}) > 0;`, 5000);
  check('… the code with nothing chosen: the bare player at the station\'s public address, 100% by 600', (await snippet()) === `<iframe src="${site}/embed/podcasts" title="KPFK podcast player" width="100%" height="600" style="border:0;max-width:100%" allow="autoplay" loading="lazy"></iframe>`, await snippet());
  const inFrame = js => ev(`var d = document.getElementById('emFrame').contentDocument; if (!d) return false; ${js}`);
  check('… the preview is the real player, listing episodes, 600px tall', await until(`var f = document.getElementById('emFrame'), d = f.contentDocument; return f.getAttribute('src') === '/embed/podcasts' && f.offsetHeight === 600 && !!d && d.querySelectorAll('.pe-episode').length > 0;`, 20000));
  check('… the starting-show list has every show', await until(`return document.getElementById('emShow').options.length === ${first.count} + 1;`, 15000), await ev(`return document.getElementById('emShow').options.length;`));

  await p.click('[data-em-theme="light"]');
  check('Light: the code says theme=light and the preview turns light', /\/embed\/podcasts\?theme=light"/.test(await snippet())
    && await until(`var f = document.getElementById('emFrame'), d = f.contentDocument; return f.getAttribute('src') === '/embed/podcasts?theme=light' && !!d && !!d.getElementById('player') && d.getElementById('player').getAttribute('data-theme') === 'light' && d.querySelectorAll('.pe-episode').length > 0;`, 15000), await snippet());
  await ev(`var s = document.getElementById('emShow'); s.value = ${JSON.stringify(first.secondKey)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
  await p.click('#emPresets .em-chip:nth-child(10)');
  const chosen = await snippet();
  check('a starting show and the KPFK red preset go into the code', chosen.indexOf('show=' + first.secondKey) > 0 && /dark=e14a2e&amp;light=c8371e/.test(chosen)
    && await ev(`return document.querySelector('#emPresets .em-chip:nth-child(10)').getAttribute('aria-pressed') === 'true' && document.getElementById('emDarkHex').value === '#e14a2e' && document.getElementById('emOpen').getAttribute('href').indexOf('dark=e14a2e&light=c8371e') > 0;`), chosen);
  check('… and the preview follows: that show, the red accent', await until(`var d = document.getElementById('emFrame').contentDocument, t = d && d.querySelector('.pe-show-title'), b = d && d.querySelector('.pe-play-btn');
    return !!t && t.textContent === ${JSON.stringify(first.second)} && getComputedStyle(b).backgroundColor === 'rgb(200, 55, 30)';`, 15000), await inFrame(`var t = d.querySelector('.pe-show-title'); return t && t.textContent;`));
  await p.click('[data-em-switch="header"]');
  check('Header off: the code says so, and the two header switches and the title box are set aside', /header=false/.test(await snippet())
    && await ev(`return document.querySelector('[data-em-switch="headerIcon"]').disabled && document.querySelector('[data-em-switch="themeToggle"]').disabled && document.getElementById('emHeading').disabled && !document.querySelector('[data-em-switch="cover"]').disabled;`));
  await p.click('[data-em-switch="header"]');
  await ev(`var i = document.getElementById('emHeading'); i.focus(); return 1;`);
  await p.send('Input.insertText', { text: 'Listen "now" <b>' });
  const titled = await snippet();
  check('a title with quotes and brackets cannot break the code', /title=Listen\+%22now%22\+%3Cb%3E/.test(titled) && /title="Listen &quot;now&quot; &lt;b&gt; podcast player"/.test(titled) && !/<b>/.test(titled), titled);
  await ev(`document.getElementById('emHeading').blur(); var w = document.getElementById('emWidth'); w.focus(); w.select(); return 1;`);
  await p.send('Input.insertText', { text: '5' });
  await ev(`var h = document.getElementById('emHeight'); h.focus(); h.select(); return 1;`);
  await p.send('Input.insertText', { text: '99999' });
  check('sizes out of range are held to sensible ones (10%, 1600px)', / width="10%" height="1600"/.test(await snippet()), await snippet());
  await ev(`document.getElementById('emHeight').blur(); return 1;`);

  await p.click('[data-em-device="phone"]');
  await sleep(600);
  const phone = await evJson(`var f = document.getElementById('emFrame'), d = f.contentDocument, w = d.defaultView.innerWidth;
    var wide = [].filter.call(d.querySelectorAll('.pe *'), function (n) { var r = n.getBoundingClientRect(); return r.width > 0 && r.right > w + 0.5 && !n.closest('.pe-dropdown-list'); });
    return JSON.stringify({ width: f.getBoundingClientRect().width, inner: w, sideways: d.documentElement.scrollWidth > w, cut: wide.slice(0, 3).map(function (n) { return n.className; }),
      note: document.getElementById('emDeviceNote').textContent, code: /width="10%"/.test(document.getElementById('emSnippet').textContent) });`);
  check('Phone preview: the real player in a 375px frame, nothing sideways; the code is unchanged', phone.width === 375 && phone.inner === 375 && !phone.sideways && phone.cut && !phone.cut.length && phone.note === '375px wide' && phone.code, JSON.stringify(phone));

  await p.click('#emCopy');
  await until(`return document.getElementById('emCopyStatus').textContent !== '';`, 3000);
  const copied = await ev(`return document.getElementById('emCopyStatus').textContent;`);
  check('Copy says what happened (copied, or refused by this browser)', /^Copied\.$|refused by the browser|Select the code/.test(copied), copied);
  await p.click('#emReset');
  check('Reset all: back to the bare code and the default preview', (await snippet()) === `<iframe src="${site}/embed/podcasts" title="KPFK podcast player" width="100%" height="600" style="border:0;max-width:100%" allow="autoplay" loading="lazy"></iframe>`
    && await until(`return document.getElementById('emFrame').getAttribute('src') === '/embed/podcasts' && document.getElementById('emHeading').value === '' && document.querySelector('[data-em-theme="dark"]').getAttribute('aria-pressed') === 'true';`, 5000), await snippet());
  check('the Embeds tab draws no sideways scroll at desktop width', await ev(`return document.documentElement.scrollWidth <= innerWidth;`));
  check('the studio: no uncaught errors', !errors.length, errors.slice(0, 3).join('\n     '));

  // Phone: three tabs side by side, every title readable, the code maker in one column.
  errors = [];
  await size(390, 844, true);
  await go('/studio#embeds');
  await until(`return !document.getElementById('embedsPanel').hidden && !document.getElementById('tabDiscovery').hidden;`, 15000);
  await sleep(600);
  const tabs = await evJson(`var t = [].filter.call(document.querySelectorAll('.studio-tab'), function (b) { return !b.hidden; });
    return JSON.stringify({ n: t.length, row: t.every(function (b) { return Math.abs(b.getBoundingClientRect().top - t[0].getBoundingClientRect().top) < 1; }),
      fit: t.every(function (b) { var r = b.getBoundingClientRect(), x = b.querySelector('.studio-tab-title'), xr = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && xr.left >= r.left && xr.right <= r.right + 0.5 && x.scrollWidth <= x.clientWidth + 1 && r.height >= 44; }),
      page: document.documentElement.scrollWidth <= innerWidth, open: location.hash === '#embeds' && document.getElementById('tabEmbeds').getAttribute('aria-selected') === 'true',
      code: document.getElementById('emSnippet').getBoundingClientRect().right <= innerWidth });`);
  check('phone: #embeds opens the tab; three tabs in one row, each title whole and tappable; nothing sideways', tabs.n === 3 && tabs.row && tabs.fit && tabs.page && tabs.open && tabs.code && !errors.length, JSON.stringify(tabs) + ' ' + errors.slice(0, 2).join(' '));

  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
