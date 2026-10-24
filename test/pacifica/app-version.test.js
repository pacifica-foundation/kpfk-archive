'use strict';
// The build version an open page compares to know a deploy happened (public/update.js,
// 2026-10-23). It must change when ANY file the listener page loads changes. It used to cover
// only app.js, styles.css, theme-boot.js, track.js and the settings, so a deploy that changed
// only the Transcript panel (along.js) or Now Playing left it as it was. A real server runs on a
// copy of the app in a temp folder; each file the served page links is given a new timestamp
// in turn (what a deploy does to it) and the version is read back. Shown to fail on the old
// appVersion() (along.js, now-playing.js and the others were not seen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function cleanEnv() { const env = { ...process.env }; for (const k of ['STATION_PROFILE', 'STATION_PROVIDER', 'STATION_ID', 'STATION_TZ', 'STUDIO_PASSWORD', 'QIR_API_KEY']) delete env[k]; return env; }
async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

test('the page, its settings file and /api/version name one build, and every file the page loads changes it', { timeout: 120000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-version-'));
  const app = path.join(tmp, 'app');
  for (const f of ['server.js', 'package.json', 'lib', 'plugins', 'public', 'admin', 'stations']) fs.cpSync(path.join(root, f), path.join(app, f), { recursive: true, preserveTimestamps: true });
  const upstream = http.createServer((req, res) => {
    const file = path.join(fixtureDir, path.basename(req.url));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json'), 'utf8'));
  profile.origins.feeds = [base];
  profile.feeds.catalog = base + '/fe_catalog_kpfk.json'; profile.feeds.channels = base + '/fe_channels.json';
  profile.plugins = { ...(profile.plugins || {}), discovery: true };
  const profileFile = path.join(tmp, 'profile.json'); fs.writeFileSync(profileFile, JSON.stringify(profile));
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['server.js'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...cleanEnv(), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', STUDIO_PASSWORD: 'pw', PORT: String(port),
      DATA_DIR: path.join(tmp, 'data'), ARTWORK_WARM: 'off', AUDIO_CHECK: 'off' } });
  child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    await new Promise(r => upstream.close(r)); fs.rmSync(tmp, { recursive: true, force: true });
  });
  for (let i = 0; i < 200; i++) { if (child.exitCode !== null) throw new Error(logs); try { if ((await fetch(url + '/healthz')).ok) break; } catch {} await sleep(30); }

  const read = async () => {
    const page = await fetch(url + '/');
    const html = await page.text();
    const meta = (/<meta name="app-version" content="([^"]*)">/.exec(html) || [])[1];
    const settings = await (await fetch(url + '/station.js')).text();
    const built = (/window\.AppBuild = "([^"]*)";\s*$/.exec(settings) || [])[1];
    const api = await fetch(url + '/api/version');
    return { html, meta, built, header: page.headers.get('x-app-version'), api: (await api.json()).version,
      apiCache: api.headers.get('cache-control'), health: (await (await fetch(url + '/healthz')).json()).version };
  };
  // Discovery starts switched off; the studio switch turns it on, which changes the page's
  // scripts and so must change the build too.
  const off = await read();
  const login = await fetch(url + '/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const csrf = (await (await fetch(url + '/api/studio/health', { headers: { Cookie: cookie } })).json()).csrf;
  const on = await fetch(url + '/api/studio/discovery', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Studio-CSRF': csrf }, body: JSON.stringify({ enabled: true }) });
  assert.equal(on.status, 200);
  const now = await read();
  assert.notEqual(now.api, off.api, 'switching Discovery on is a new build for open pages');
  assert.ok(now.meta && !/\{\{/.test(now.meta), 'the page carries its build');
  assert.deepEqual([now.built, now.header, now.api, now.health], [now.meta, now.meta, now.meta, now.meta],
    'settings file, header, /api/version and /healthz all name the page\'s build');
  assert.equal(now.apiCache, 'no-store', 'an open page always asks the server, never a cache');

  // Every local script and stylesheet the served page links, plus the page itself.
  const linked = [...now.html.matchAll(/(?:src|href)="(\/[\w./-]+\.(?:js|css))\?v=[^"]*"/g)].map(m => m[1])
    .filter(p => p !== '/station.js');   // built from the settings, which are hashed whole
  const files = ['/index.html', ...new Set(linked)];
  for (const name of ['/along.js', '/now-playing.js', '/update.js', '/app.js'].map(n => n === '/along.js' ? '/discover/along.js' : n)) {
    assert.ok(files.includes(name), `positive control: the page links ${name} (plugin scripts included)`);
  }
  // A /discover/ file is the plugin's own, or one it shares from the host's public/ (text.js).
  const onDisk = p => {
    if (!p.startsWith('/discover/')) return path.join(app, 'public', p);
    const own = path.join(app, 'plugins/discovery/public', p.slice(10));
    return fs.existsSync(own) ? own : path.join(app, 'public', p.slice(10));
  };
  const missed = [];
  let previous = now.api;
  for (const p of files) {
    const file = onDisk(p);
    // Scripts and stylesheets are versioned by size + time (as their ?v= stamps are); the page
    // itself by its content, so it gets an edit.
    if (p === '/index.html') fs.appendFileSync(file, '\n<!-- changed -->\n');
    else { const later = new Date(fs.statSync(file).mtimeMs + 60000); fs.utimesSync(file, later, later); }
    const after = await read();
    if (after.api === previous || after.meta !== after.api) missed.push(p);
    previous = after.api;
  }
  assert.deepEqual(missed, [], 'a deploy that changes only these files would go unnoticed by open pages');
});
