'use strict';
// The podcast player embed (/embed/podcasts) and the studio's Embeds tab that writes its code.
// Ported from Radio Suite's tests/embed-options.test.ts (2026-11-10): whatever the code maker writes
// into a link, the player must read back the same, for every value of every setting, not one
// example. The HTTP test runs a real server and asserts what a framing website actually gets.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const PE = require('../../public/podcast-embed-options.js');
const { ACCENT_PRESETS, DEFAULT_OPTIONS, EPISODE_LIMITS, EPISODE_SORTS, SHOW_ORDERS, THEME_BACKGROUND, THEMES,
  embedQuery, iframeCode, normalizeHex, parseEmbedOptions, textOn } = PE;
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const parse = q => parseEmbedOptions(new URLSearchParams(q));
const roundTrip = o => parse(embedQuery(o));

test('defaults make an empty link, and an empty link gives the defaults', () => {
  assert.equal(embedQuery(DEFAULT_OPTIONS), '');
  assert.deepEqual(parse(''), { ...DEFAULT_OPTIONS });
});

test('every value of every setting survives code maker -> link -> player', () => {
  // One setting changed at a time, through each of its values
  const variants = [
    ...THEMES.map(theme => ({ theme })),
    ...EPISODE_SORTS.map(sort => ({ sort })),
    ...SHOW_ORDERS.map(order => ({ order })),
    ...[null, ...EPISODE_LIMITS].map(limit => ({ limit })),
    { show: 'kpfk.kpfk.democracynow' }, { show: 'kpfk.2kpfk.bike_talk-2' },
    { episode: 'kpfk.kpfk.140927' },
    { title: 'KPFK Podcasts' }, { title: 'Ünïcode & "quotes" <b>' },
    { darkColor: '#ff6b9d' }, { lightColor: '#00796b' },
  ];
  for (const k of PE.BOOLEAN_KEYS) variants.push({ [k]: false }, { [k]: true });
  for (const v of variants) {
    const o = { ...DEFAULT_OPTIONS, ...v };
    assert.deepEqual(roundTrip(o), o, `lost in the link: ${JSON.stringify(v)}`);
  }
  // Every setting has a variant above: a new setting without one fails here, not silently.
  const covered = new Set(variants.flatMap(Object.keys));
  assert.deepEqual(Object.keys(DEFAULT_OPTIONS).filter(k => !covered.has(k)), []);

  // And many settings at once (fixed seed, so a failure repeats)
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = xs => xs[Math.floor(rnd() * xs.length)];
  for (let i = 0; i < 300; i++) {
    const hex = () => '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0');
    const o = {
      show: pick([null, 'kpfk.kpfk.uprising', 'kpfk.2kpfk.biketalk']),
      episode: pick([null, 'kpfk.kpfk.140908']),
      theme: pick(THEMES), sort: pick(EPISODE_SORTS), order: pick(SHOW_ORDERS),
      limit: pick([null, ...EPISODE_LIMITS]),
      header: rnd() < 0.5, selector: rnd() < 0.5, cover: rnd() < 0.5,
      themeToggle: rnd() < 0.5, headerIcon: rnd() < 0.5,
      title: pick([null, 'Pacifica', 'KPFK 90.7 & friends']),
      darkColor: hex(), lightColor: hex(),
    };
    assert.deepEqual(roundTrip(o), o, `combination ${i}: ${embedQuery(o)}`);
  }
});

test('settings this player does not have are ignored (Radio Suite\'s download= and icon=)', () => {
  const o = parse('download=false&icon=fa-music&theme=light');
  assert.deepEqual(o, { ...DEFAULT_OPTIONS, theme: 'light' });
  assert.ok(!('download' in o) && !('icon' in o));
});

test('a bad value in a pasted link falls back to that setting\'s default only', () => {
  const o = parse('theme=purple&sort=random&limit=7&order=x&header=maybe&dark=red&light=%23zzzzzz&show=../etc&episode=a%20b&cover=false');
  assert.deepEqual(o, { ...DEFAULT_OPTIONS, cover: false });
  // A key that names something every object has must stay a plain string, never reach a lookup table
  assert.equal(parse('show=__proto__').show, '__proto__');
  assert.deepEqual(PE.showsFromArchive({ shows: [], directory: {} }), []);
});

test('colours are read with or without "#", in any case', () => {
  assert.equal(parse('dark=FF6B9D').darkColor, '#ff6b9d');
  assert.equal(parse('dark=%23FF6B9D').darkColor, '#ff6b9d');
  assert.ok(!embedQuery({ ...DEFAULT_OPTIONS, darkColor: '#FF6B9D' }).includes('%23'), 'no "#" to escape in the link');
});

test('the iframe code cannot be broken out of by a title or link', () => {
  const code = iframeCode('https://x/embed/podcasts?title=a"b', '100%', '600', 'Bad "title" <script>');
  assert.ok(!code.includes('<script>'));
  assert.ok(!/title="Bad "/.test(code));
  assert.match(code, /^<iframe src="https:\/\/x\/embed\/podcasts\?title=a&quot;b" title="Bad &quot;title&quot; &lt;script&gt;" width="100%" height="600"/);
});

test('play icons are white on the accent unless white would be unreadable', () => {
  assert.equal(textOn('#3b82f6'), '#ffffff'); // 3.7:1
  assert.equal(textOn('#2563eb'), '#ffffff');
  assert.equal(textOn('#ffeb3b'), '#000000'); // yellow
  assert.equal(textOn('#000000'), '#ffffff');
  assert.equal(textOn('#ffffff'), '#000000');
  assert.equal(textOn('#bb86fc'), '#000000'); // white is only 2.5:1
  // Whatever is chosen, it meets 3:1 on every grey from black to white
  for (let v = 0; v <= 255; v += 5) {
    const hex = '#' + v.toString(16).padStart(2, '0').repeat(3);
    const lum = PE.luminance(hex);
    const ratio = textOn(hex) === '#ffffff' ? 1.05 / (lum + 0.05) : (lum + 0.05) / 0.05;
    assert.ok(ratio >= 3, `${hex}: ${ratio.toFixed(2)}:1`);
  }
});

test('every colour preset reads as text on its theme and under the play icon; the site\'s red is the default', () => {
  const ratio = (a, b) => {
    const [x, y] = [PE.luminance(a), PE.luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const names = new Set();
  for (const p of ACCENT_PRESETS) {
    names.add(p.name);
    for (const theme of ['dark', 'light']) {
      const c = p[theme];
      assert.equal(normalizeHex(c), c, `${p.name} ${theme}: lower-case #rrggbb`);
      assert.ok(ratio(c, THEME_BACKGROUND[theme]) >= 4.5, `${p.name} ${theme} as text: ${ratio(c, THEME_BACKGROUND[theme]).toFixed(2)}:1`);
      assert.ok(ratio(c, textOn(c)) >= 3, `${p.name} ${theme} under the icon: ${ratio(c, textOn(c)).toFixed(2)}:1`);
    }
    const o = { ...DEFAULT_OPTIONS, darkColor: p.dark, lightColor: p.light };
    assert.deepEqual(roundTrip(o), o, `${p.name} survives the link`);
  }
  assert.equal(names.size, ACCENT_PRESETS.length, 'preset names are unique');
  assert.equal(DEFAULT_OPTIONS.darkColor, '#e14a2e', 'the site\'s --accent, dark theme');
  assert.equal(DEFAULT_OPTIONS.lightColor, '#c8371e', 'the site\'s --accent, light theme');
  assert.equal(textOn(DEFAULT_OPTIONS.darkColor), '#ffffff', 'white icons on the red, as on the site');
  assert.equal(textOn(DEFAULT_OPTIONS.lightColor), '#ffffff');
  // The stylesheet's own defaults (used before the script runs) are the same pair and backgrounds
  const css = fs.readFileSync(path.join(root, 'public/podcast-embed.css'), 'utf8');
  for (const [name, value] of [['--pe-accent-dark', DEFAULT_OPTIONS.darkColor], ['--pe-accent-light', DEFAULT_OPTIONS.lightColor],
    ['--pe-on-accent-dark', textOn(DEFAULT_OPTIONS.darkColor)], ['--pe-on-accent-light', textOn(DEFAULT_OPTIONS.lightColor)]]) {
    assert.ok(css.includes(`${name}: ${value};`), `${name} in the stylesheet is ${value}`);
  }
  assert.ok(css.includes(`--pe-bg: ${THEME_BACKGROUND.dark};`) && css.includes(`--pe-bg: ${THEME_BACKGROUND.light};`), 'the contrast checks use the stylesheet\'s backgrounds');
});

test('the player\'s colours are the site\'s: every copied token matches public/styles.css in both themes', () => {
  // The embed page loads only its own stylesheet, so it carries copies of the site's tokens. Any
  // drift (the site changes a colour) fails here instead of the player quietly looking different.
  const site = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/podcast-embed.css'), 'utf8');
  const block = (src, start) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('}', i)); };
  const token = (text, name) => { const m = new RegExp(name.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+);').exec(text); return m && m[1].trim(); };
  const themes = {
    dark: { site: block(site, ':root[data-theme="dark"]'), embed: block(css, '.pe {') },
    light: { site: block(site, '@media (prefers-color-scheme: light)'), embed: block(css, '.pe[data-theme="light"] {') },
  };
  const pairs = [['--surface-0', '--pe-bg'], ['--surface-1', '--pe-raised'], ['--surface-2', '--pe-surface'], ['--surface-3', '--pe-surface-3'],
    ['--surface-hover', '--pe-hover'], ['--outline', '--pe-border'], ['--outline-strong', '--pe-border-strong'],
    ['--ink', '--pe-text'], ['--ink-dim', '--pe-text-2'], ['--ink-faint', '--pe-text-3'], ['--accent-2', '--pe-teal'],
    ['--shadow', '--pe-shadow'], ['--elev-1', '--pe-elev-1'], ['--elev-2', '--pe-elev-2']];
  const norm = v => String(v).replace(/\s+/g, '').replace(/,0\./g, ',.').toLowerCase();
  for (const [theme, b] of Object.entries(themes)) {
    for (const [siteName, peName] of pairs) {
      const want = token(b.site, siteName), got = token(b.embed, peName);
      assert.ok(want, `${theme}: ${siteName} found in styles.css`);
      assert.equal(norm(got), norm(want), `${theme}: ${peName} should be the site's ${siteName}`);
    }
    assert.equal(THEME_BACKGROUND[theme], token(b.site, '--surface-0'), `${theme}: the contrast checks use the site's page colour`);
    assert.equal(theme === 'dark' ? DEFAULT_OPTIONS.darkColor : DEFAULT_OPTIONS.lightColor, token(b.site, '--accent'), `${theme}: the default accent is the site's`);
  }
  // Fonts: the site's display and text faces
  for (const [siteName, peName] of [['--font-display', '--pe-font-display'], ['--font-body', '--pe-font-body']]) {
    assert.equal(token(css, peName), token(site, siteName), `${peName} is the site's ${siteName}`);
  }
  // The check can see drift: a changed site colour is reported.
  assert.notEqual(norm(token(themes.light.embed, '--pe-bg')), norm('#ffffff'));
});

test('"latest N" keeps the newest N, whatever the order shown', () => {
  const day = 86400, eps = [1, 2, 3, 4, 5, 6, 7].map(d => ({ title: `Ep ${8 - d}`, airStart: 1794000000 + d * day }));
  const days = xs => xs.map(e => (e.airStart - 1794000000) / day);
  assert.deepEqual(days(PE.episodesToShow(eps, 'newest', 5)), [7, 6, 5, 4, 3]);
  assert.deepEqual(days(PE.episodesToShow(eps, 'oldest', 5)), [3, 4, 5, 6, 7]);
  assert.deepEqual(days(PE.episodesToShow(eps, 'alphabetical', 3)), [7, 6, 5]); // Ep 1, Ep 2, Ep 3
  assert.equal(PE.episodesToShow(eps, 'newest', null).length, 7);
  assert.deepEqual(days(eps), [1, 2, 3, 4, 5, 6, 7], 'input not changed');
});

test('show picker orders', () => {
  const shows = [
    { title: 'B', episodeCount: 5, latestAt: 1794000000 },
    { title: 'A', episodeCount: 2, latestAt: 1794400000 },
    { title: 'C', episodeCount: 5, latestAt: 0 },
  ];
  assert.deepEqual(PE.orderShows(shows, 'alphabetical').map(s => s.title), ['A', 'B', 'C']);
  assert.deepEqual(PE.orderShows(shows, 'latest').map(s => s.title), ['A', 'B', 'C']);
  assert.deepEqual(PE.orderShows(shows, 'most-episodes').map(s => s.title), ['B', 'C', 'A']);
  assert.deepEqual(shows.map(s => s.title), ['B', 'A', 'C'], 'input not changed');
});

test('times, lengths and the air date in the station\'s time zone', () => {
  assert.equal(PE.formatTime(0), '0:00');
  assert.equal(PE.formatTime(59.9), '0:59');
  assert.equal(PE.formatTime(3725), '1:02:05');
  assert.equal(PE.formatTime(NaN), '0:00');
  assert.equal(PE.formatLength(3600), '1 hr');
  assert.equal(PE.formatLength(3603), '1 hr');
  assert.equal(PE.formatLength(3900), '1 hr 5 min');
  assert.equal(PE.formatLength(3480), '58 min');
  assert.equal(PE.formatLength(3599), '1 hr', 'never "60 min"');
  assert.equal(PE.formatLength(7199), '2 hr', 'never "1 hr 60 min"');
  assert.equal(PE.formatLength(0), '');
  // 2026-11-11 06:00 in Los Angeles is still the 11th there, whatever zone the visitor is in
  assert.equal(PE.formatAirDate(1794405600, 'America/Los_Angeles'), 'Nov 11, 2026');
  assert.equal(PE.formatAirDate(1794405600 - 7 * 3600, 'America/Los_Angeles'), 'Nov 10, 2026');
});

test('the feed as the player lists it: shows with their episodes, topics as titles only when title-length', () => {
  const long = 'x'.repeat(201);
  const archive = {
    directory: {
      'kpfk.kpfk.a': { name: 'Alpha', dj: 'Host A', desc: 'About Alpha', photo: '/api/artwork/aa', categoryLabel: 'Public Affairs',
        url: 'http://www.kpfk.org/on-air/alpha/', facebook: 'javascript:alert(1)', twitter: 'https://x.com/alpha' },
      'kpfk.kpfk.empty': { name: 'No episodes', dj: '', desc: '', photo: '/api/artwork/ee' },
    },
    shows: [
      { id: 'kpfk.kpfk.1', sho: 'kpfk.kpfk.a', title: 'Alpha', dt: 200, dateText: 'Tuesday 4:00 pm', durationSec: 3600, mp3: 'https://archive.kpfk.org/mp3/1.mp3', photo: '/api/artwork/aa', published: [{ topic: ' A real topic ' }], episodeDesc: 'Notes' },
      { id: 'kpfk.kpfk.2', sho: 'kpfk.kpfk.a', title: 'Alpha', dt: 100, dateText: 'Monday 4:00 pm', durationSec: 0, mp3: 'https://archive.kpfk.org/mp3/2.mp3', photo: '', published: [{ topic: long }], episodeDesc: '' },
      { id: 'kpfk.kpfk.3', sho: 'kpfk.kpfk.orphan', title: 'Orphan', dt: 50, dateText: 'Sunday', durationSec: 60, mp3: 'https://archive.kpfk.org/mp3/3.mp3', photo: '/api/artwork/oo', published: [] },
      { id: 'kpfk.kpfk.4', sho: 'kpfk.kpfk.a', title: 'Alpha', dt: 300, mp3: '' },   // nothing to play
    ],
  };
  const shows = PE.showsFromArchive(archive);
  assert.deepEqual(shows.map(s => s.key), ['kpfk.kpfk.a', 'kpfk.kpfk.orphan'], 'a show with no episodes is not offered');
  const a = shows[0];
  assert.deepEqual({ title: a.title, host: a.host, description: a.description, image: a.image, episodeCount: a.episodeCount, latestAt: a.latestAt },
    { title: 'Alpha', host: 'Host A', description: 'About Alpha', image: '/api/artwork/aa', episodeCount: 2, latestAt: 200 });
  assert.deepEqual(a.episodes[0], { id: 'kpfk.kpfk.1', title: 'A real topic', hasTopic: true, airStart: 200, duration: 3600,
    description: 'Notes', audioUrl: 'https://archive.kpfk.org/mp3/1.mp3', image: '/api/artwork/aa', transcriptId: '' });
  // Show info: the site's show page (public/links.js showPath) and the show's own web links only
  assert.equal(a.category, 'Public Affairs');
  assert.equal(a.sitePath, '/show/a');
  assert.deepEqual(a.links, [{ label: 'Website', url: 'http://www.kpfk.org/on-air/alpha/' }, { label: 'X', url: 'https://x.com/alpha' }], 'a javascript: link is never offered');
  assert.equal(a.sitePath, require('../../public/links.js').showPath(a.key), 'the same address the site builds');
  assert.equal(a.episodes[1].title, 'Monday 4:00 pm', 'a pasted description is not a title; the air time is');
  assert.equal(a.episodes[1].hasTopic, false);
  assert.equal(a.episodes[1].image, '/api/artwork/aa', 'an episode without its own picture uses the show\'s');
  assert.equal(shows[1].title, 'Orphan', 'a show missing from the directory still lists, by the episode\'s show name');
  // Every picture is this site's own copy: the page's policy (img-src 'self') voids anything else
  for (const s of shows) for (const img of [s.image, ...s.episodes.map(e => e.image)]) assert.match(img, /^\/api\/artwork\//);
});

test('QIR notes join a show\'s episodes as on the site: headline and summary only where the feed has none, transcript id kept', () => {
  const show = PE.showsFromArchive({
    directory: { 'kpfk.kpfk.dn': { name: 'Democracy Now!' } },
    shows: [
      { id: 'kpfk.kpfk.1', sho: 'kpfk.kpfk.dn', dt: 300, dateText: 'Tuesday 4:00 pm', durationSec: 3600, mp3: 'https://archive.kpfk.org/mp3/1.mp3', photo: '/api/artwork/x', published: [] },
      { id: 'kpfk.kpfk.2', sho: 'kpfk.kpfk.dn', dt: 200, dateText: 'Monday 4:00 pm', durationSec: 3600, mp3: 'https://archive.kpfk.org/mp3/2.mp3', photo: '/api/artwork/x', published: [{ topic: 'Feed topic' }], episodeDesc: 'Feed notes' },
      { id: 'kpfk.kpfk.3', sho: 'kpfk.kpfk.dn', dt: 100, dateText: 'Sunday 4:00 pm', durationSec: 3600, mp3: 'https://archive.kpfk.org/mp3/3.mp3', photo: '/api/artwork/x', published: [] },
      { id: 'kpfk.kpfk.4', sho: 'kpfk.kpfk.dn', dt: 50, dateText: 'Saturday 4:00 pm', durationSec: 3600, mp3: 'https://archive.kpfk.org/mp3/4.mp3', photo: '/api/artwork/x', published: [] },
    ],
  })[0];
  const notes = {
    'kpfk.kpfk.1': { qir: 'ba7691fd-c65e-4b47-b80a-fe9057c7809d', headline: 'QIR headline', summary: 'QIR summary', host: '', guest: '' },
    'kpfk.kpfk.2': { qir: 'aa7691fd-c65e-4b47-b80a-fe9057c7809d', headline: 'Not used', summary: 'Not used', host: '', guest: '' },
    'kpfk.kpfk.3': { pending: true, skipped: false },
    'kpfk.kpfk.4': { qir: '../../etc', headline: 'Bad id', summary: '' },
    'kpfk.kpfk.other': { qir: 'ca7691fd-c65e-4b47-b80a-fe9057c7809d', headline: 'Another show', summary: '' },
  };
  assert.equal(PE.applyNotes(show, notes), 2);
  const [e1, e2, e3, e4] = show.episodes;
  assert.deepEqual([e1.title, e1.hasTopic, e1.description, e1.transcriptId], ['QIR headline', true, 'QIR summary', 'ba7691fd-c65e-4b47-b80a-fe9057c7809d']);
  assert.deepEqual([e2.title, e2.description, e2.transcriptId], ['Feed topic', 'Feed notes', 'aa7691fd-c65e-4b47-b80a-fe9057c7809d'], 'the feed\'s own title and notes are kept');
  assert.deepEqual([e3.title, e3.transcriptId], ['Sunday 4:00 pm', ''], 'pending: nothing yet');
  assert.deepEqual([e4.title, e4.transcriptId], ['Saturday 4:00 pm', ''], 'an id that is not QIR\'s shape is never put in an address');
  assert.equal(PE.applyNotes(show, notes), 2, 'safe to run twice');
  assert.equal(e1.title, 'QIR headline');
  assert.equal(PE.applyNotes(show, null), 0);
  assert.equal(PE.applyNotes(show, JSON.parse('{"__proto__": {"qir": "x"}}')), 0);
});

test('player stylesheet: element resets never outrank component colours', () => {
  // A rule like `.pe button { color: inherit }` (class + element) beats `.pe-ctrl--play { color: ... }`
  // (class), so every button lost its own colour (Radio Suite, 2026-11-10: play icons black, grey
  // controls full white). Element-wide rules must sit inside :where(.pe), and none may need !important.
  const offenders = css => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|\})\s*([^{}]+)\{([^}]*)\}/g)]
    .filter(m => /(^|[\s,>])\.pe\s+[a-z]+\b(?![-\w])/.test(m[2]) && /(^|;|\s)color\s*:/.test(m[3]))
    .map(m => m[2].trim());
  const css = fs.readFileSync(path.join(root, 'public/podcast-embed.css'), 'utf8');
  assert.deepEqual(offenders(css), [], 'element rules setting color must use :where(.pe)');
  assert.ok(!css.replace(/\/\*[\s\S]*?\*\//g, '').includes('!important'), 'no !important in the player stylesheet');
  // The check can still see the fault: the same stylesheet with the old reset is reported.
  assert.deepEqual(offenders(css.replace(':where(.pe) button {', '.pe button {')), ['.pe button']);
});

test('the embed page and its scripts set no inline styles (the page\'s policy would void them)', () => {
  const html = fs.readFileSync(path.join(root, 'embed/podcasts.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/\sstyle=/.test(html) && !/<style/.test(html), 'no style attribute or <style> in the page');
  // Code only: the comments explain both rules in words.
  const js = fs.readFileSync(path.join(root, 'public/podcast-embed.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  assert.ok(!/setAttribute\(\s*['"]style['"]/.test(js) && !/cssText/.test(js) && !/style=\\?["']/.test(js), 'the script sets styles through CSSOM properties only');
  assert.ok(/root\.style\.setProperty\('--pe-accent-dark'/.test(js), 'positive control: the accent is set, through CSSOM');
  assert.ok(!/scrollIntoView/.test(js), 'scrollIntoView can scroll the host page');
});

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
function cleanEnv() {
  const env = { ...process.env };
  for (const k of ['STATION_PROVIDER', 'STATION_ID', 'STATION_TZ', 'STATION_PROFILE', 'STUDIO_PASSWORD', 'PORT', 'DATA_DIR']) delete env[k];
  return env;
}

test('real HTTP: any website may frame the player; it reads the site\'s own feed; other pages keep their rules', { timeout: 120000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-pe-http-'));
  const upstream = http.createServer((req, res) => {
    const name = path.basename(req.url), file = path.join(fixtureDir, name);
    if (!name.startsWith('fe_') || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json'), 'utf8'));
  profile.origins.feeds = [base];
  profile.feeds.catalog = base + '/fe_feed/fe_catalog_kpfk.json'; profile.feeds.channels = base + '/fe_feed/fe_channels.json';
  const profileFile = path.join(tmp, 'profile.json'); fs.writeFileSync(profileFile, JSON.stringify(profile));
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...cleanEnv(), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', PORT: String(port), DATA_DIR: path.join(tmp, 'data'), ARTWORK_WARM: 'off', AUDIO_CHECK: 'off' } });
  child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    await new Promise(r => upstream.close(r)); fs.rmSync(tmp, { recursive: true, force: true });
  });
  for (let i = 0; i < 200; i++) { if (child.exitCode !== null) throw new Error(logs); try { if ((await fetch(url + '/healthz')).ok) break; } catch {} await sleep(30); }

  // With settings in the link too: the server serves one page, the script reads the link.
  for (const p of ['/embed/podcasts', '/embed/podcasts?theme=light&show=kpfk.kpfk.democracynow']) {
    const res = await fetch(url + p), page = await res.text(), csp = res.headers.get('content-security-policy');
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('x-frame-options'), null, 'X-Frame-Options would forbid every frame');
    assert.equal((csp.match(/frame-ancestors ([^;]*)/) || [])[1], '*', 'any website may frame the player');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    // The rest of the policy is the site's: its own scripts and styles, audio from the station's hosts.
    assert.match(csp, /script-src 'self'(;|$)/); assert.match(csp, /style-src 'self'(;|$)/); assert.match(csp, /img-src 'self' data:(;|$)/);
    for (const origin of profile.origins.audio) assert.ok(csp.includes(origin), `media-src allows ${origin}`);
    for (const f of ['podcast-embed.css', 'station.js', 'podcast-embed-options.js', 'podcast-embed.js', 'track.js']) {
      assert.match(page, new RegExp(`(href|src)="/${f.replace('.', '\\.')}\\?v=[^"]+"`), `${f} is version-stamped (never stale)`);
    }
    assert.match(page, /<title>KPFK podcast player<\/title>/, 'station name rendered');
    assert.ok(!/\{\{/.test(page), 'no unrendered placeholder');
  }
  // Every file the page asks for is served, with a type the browser will run
  for (const [f, type] of [['podcast-embed.css', /^text\/css/], ['podcast-embed.js', /javascript/], ['podcast-embed-options.js', /javascript/]]) {
    const res = await fetch(`${url}/${f}`);
    assert.equal(res.status, 200, f); assert.match(res.headers.get('content-type'), type, f);
    await res.arrayBuffer();
  }

  // The player lists the site's own feed: every show with episodes, nothing the site withholds.
  const archive = await (await fetch(url + '/api/archive')).json();
  const shows = PE.showsFromArchive(archive);
  assert.ok(shows.length > 20, `shows from the fixture feed: ${shows.length}`);
  assert.equal(shows.reduce((n, s) => n + s.episodes.length, 0), archive.shows.length, 'every episode the site lists, and no other');
  for (const withheld of profile.withheldShows || []) assert.ok(!shows.some(s => s.key.endsWith('.' + withheld)), `${withheld} is withheld from the embed too`);
  for (const s of shows) for (const e of s.episodes) {
    assert.ok(profile.origins.audio.includes(new URL(e.audioUrl).origin), `${e.audioUrl} is on a host the page may play from`);
    assert.match(e.image, /^\/(api\/artwork|assets)\//, 'artwork is this site\'s own copy or its placeholder');
  }

  // Positive controls: the other pages keep their own frame rules.
  const fund = await fetch(url + '/embed/fund-drive');
  assert.deepEqual((fund.headers.get('content-security-policy').match(/frame-ancestors ([^;]*)/) || [])[1].split(' ').sort(),
    ["'self'", 'https://kpfk.org', 'https://www.kpfk.org'], 'the fund drive capsule is still the station\'s sites only');
  const home = await fetch(url + '/');
  assert.equal(home.headers.get('x-frame-options'), 'SAMEORIGIN', 'the listener site still refuses frames');
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'self'(;|$)/);
  // Lookalike paths are not the embed: they get the listener page and its rules, never "any website".
  for (const p of ['/embed/podcastsx', '/embed/podcasts/', '/embeds/podcasts']) {
    const res = await fetch(url + p); await res.text();
    assert.ok(!/frame-ancestors \*/.test(res.headers.get('content-security-policy') || ''), `${p} must not be framable by any website`);
  }
});

test('counting: an embed sends plays and listening time, never a page view', () => {
  const js = fs.readFileSync(path.join(root, 'public/track.js'), 'utf8');
  const sends = [];
  const run = pathname => {
    sends.length = 0;
    const doc = { addEventListener() {}, getElementById() { return null; } };
    const win = { StationConfig: { liveStream: 'https://streams.pacifica.org:9000/kpfk_128' }, addEventListener() {} };
    const nav = { sendBeacon(u, blob) { sends.push(blob.body); return true; } };
    const BlobStub = function (parts) { this.body = JSON.parse(parts[0]); };
    new Function('window', 'document', 'navigator', 'location', 'Blob', 'setInterval', 'Intl', js)(
      win, doc, nav, { pathname }, BlobStub, () => 0, Intl);
    return sends.filter(s => s.t === 'pageview').length;
  };
  assert.equal(run('/'), 1, 'positive control: the site itself counts a page view');
  assert.equal(run('/live'), 1);
  assert.equal(run('/embed/podcasts'), 0, 'an embed on another website is not a visit here');
});
