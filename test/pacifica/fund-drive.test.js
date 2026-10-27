'use strict';
// Fund drive, Phase 4a (Paul, 2026-10-27): the donation capsule's figures, set in the studio.
// Unit tests pin the rules (lib/fund-drive.js); the HTTP test runs a real server and asserts what a
// listener, a framing website and the studio actually get.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const F = require('../../lib/fund-drive');
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(root, 'docs/fixtures/pacifica-kpfk-2026-09-14');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function writeJsonAtomic(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); }

test('the figures: whole dollars, a goal before switching on, no stray fields', () => {
  const ok = F.checkValues({ on: true, name: '  Fall   Fund Drive ', goal: 75000, pledged: 42350 });
  assert.deepEqual(ok, { ok: true, values: { on: true, name: 'Fall Fund Drive', goal: 75000, pledged: 42350 } });
  assert.ok(F.checkValues({ on: false, goal: 0, pledged: 0 }).ok, 'off with nothing set is fine');
  assert.ok(F.checkValues({ on: true, goal: 1000, pledged: 5000 }).ok, 'pledges may pass the goal');
  for (const bad of [
    null, [], 'x',
    { on: 'yes', goal: 1, pledged: 0 },
    { on: true, goal: 0, pledged: 0 },              // on without a goal
    { on: true, goal: 1.5, pledged: 0 },
    { on: true, goal: -1, pledged: 0 },
    { on: true, goal: '75000', pledged: 0 },         // numbers, not text
    { on: true, goal: F.AMOUNT_MAX + 1, pledged: 0 },
    { on: true, goal: 10, pledged: 0, name: 'x'.repeat(F.NAME_MAX + 1) },
    { on: true, goal: 10, pledged: 0, name: '<script>' },
    { on: true, goal: 10, pledged: 0, extra: 1 },
  ]) assert.equal(F.checkValues(bad).ok, false, JSON.stringify(bad));
});

test('store: publish, the same figures again change nothing, undo, and it survives a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-fd-'));
  let t = Date.parse('2026-10-27T20:00:00Z');
  const open = () => F.createFundDrive({ dataDir: dir, writeJsonAtomic, now: () => (t += 1000) });
  try {
    const s = open();
    assert.deepEqual(s.public(), { on: false, name: '', goal: 0, pledged: 0, updatedAt: null }, 'off until set');
    assert.equal(s.apply({ on: true, goal: 0, pledged: 0 }).ok, false, 'refused edits write nothing');
    assert.equal(s.history().length, 0);
    assert.ok(s.apply({ on: true, name: 'Fall', goal: 75000, pledged: 100 }).ok);
    assert.ok(s.apply({ on: true, name: 'Fall', goal: 75000, pledged: 2500 }).ok);
    assert.deepEqual(s.apply({ on: true, name: 'Fall', goal: 75000, pledged: 2500 }), { ok: true, unchanged: true }, 'a double click');
    assert.equal(s.history().length, 2);
    const again = open();   // a restart reads what was published
    assert.equal(again.public().pledged, 2500);
    assert.ok(again.public().updatedAt);
    assert.ok(again.undo().ok); assert.equal(again.public().pledged, 100);
    assert.ok(again.undo().ok); assert.equal(again.public().on, false, 'back to never set');
    assert.equal(again.undo().ok, false, 'nothing left to undo');
    // A damaged file is reported and shown as off, never trusted.
    writeJsonAtomic(path.join(dir, 'fund-drive', 'current.json'), { schemaVersion: 1, values: { on: true, goal: -5, pledged: 0 } });
    const broken = open();
    assert.ok(broken.bootError());
    assert.equal(broken.public().on, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- real HTTP
function cleanEnv() { const env = { ...process.env }; for (const k of ['STATION_PROFILE', 'STATION_PROVIDER', 'STATION_ID', 'STATION_TZ', 'STUDIO_PASSWORD']) delete env[k]; return env; }
async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

test('real HTTP: the studio publishes, listeners and the embed see it; only the station\'s sites may frame the embed', { timeout: 120000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-fd-http-'));
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
    env: { ...cleanEnv(), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', STUDIO_PASSWORD: 'pw', PORT: String(port), DATA_DIR: path.join(tmp, 'data'), ARTWORK_WARM: 'off', AUDIO_CHECK: 'off' } });
  child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    await new Promise(r => upstream.close(r)); fs.rmSync(tmp, { recursive: true, force: true });
  });
  for (let i = 0; i < 200; i++) { if (child.exitCode !== null) throw new Error(logs); try { if ((await fetch(url + '/healthz')).ok) break; } catch {} await sleep(30); }
  const login = await fetch(url + '/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const csrf = (await (await fetch(url + '/api/studio/health', { headers: { Cookie: cookie } })).json()).csrf;
  const post = (p, body, extra = {}) => fetch(url + p, { method: 'POST', body: JSON.stringify(body), headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Studio-CSRF': csrf, ...extra } });
  const figures = async () => { const r = await fetch(url + '/api/fund-drive'); return { cache: r.headers.get('cache-control'), body: await r.json() }; };

  const first = await figures();
  assert.equal(first.body.on, false, 'off until the studio sets it');
  assert.equal(first.cache, 'no-store', 'never cached: the total should climb on screen');

  // The guard: signed in and the token, every time.
  assert.equal((await fetch(url + '/api/studio/fund-drive')).status, 401);
  assert.equal((await fetch(url + '/api/studio/fund-drive/apply', { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await post('/api/studio/fund-drive/apply', { on: true, goal: 10, pledged: 0 }, { 'X-Studio-CSRF': 'wrong' })).status, 403);
  assert.equal((await post('/api/studio/fund-drive/apply', { on: true, goal: 0, pledged: 0 })).status, 422, 'on without a goal');
  assert.equal((await figures()).body.on, false, 'a refused edit changes nothing');

  await sleep(1100);
  const applied = await post('/api/studio/fund-drive/apply', { on: true, name: 'Fall Fund Drive', goal: 75000, pledged: 42350 });
  assert.equal(applied.status, 200, await applied.clone().text());
  const state = await applied.json();
  assert.equal(state.current.pledged, 42350);
  assert.match(state.embedUrl, /\/embed\/fund-drive$/);
  assert.deepEqual((({ on, name, goal, pledged }) => ({ on, name, goal, pledged }))((await figures()).body),
    { on: true, name: 'Fall Fund Drive', goal: 75000, pledged: 42350 }, 'listeners see it at once');
  assert.equal((await post('/api/studio/fund-drive/apply', { on: true, name: 'Fall Fund Drive', goal: 75000, pledged: 50000 })).status, 429, 'one change a second');
  await sleep(1100);
  assert.equal((await post('/api/studio/fund-drive/undo', {})).status, 200);
  assert.equal((await figures()).body.on, false, 'undo puts back the previous figures');

  // The embed: framed by this app and the station's website only; the listener site stays unframeable.
  const embed = await fetch(url + '/embed/fund-drive');
  const page = await embed.text(), csp = embed.headers.get('content-security-policy');
  assert.equal(embed.status, 200);
  assert.equal(embed.headers.get('x-frame-options'), null, 'X-Frame-Options would forbid every frame');
  const ancestors = (csp.match(/frame-ancestors ([^;]*)/) || [])[1];
  assert.deepEqual(ancestors.split(' ').sort(), ["'self'", 'https://kpfk.org', 'https://www.kpfk.org'], ancestors);
  assert.match(page, /<script src="\/fund-drive\.js\?v=[^"]+"/, 'version-stamped (never stale)');
  assert.match(page, /<script src="\/fund-drive-embed\.js\?v=[^"]+"/);
  assert.match(page, /KPFK fund drive/, 'station name rendered');
  const home = await fetch(url + '/');
  assert.equal(home.headers.get('x-frame-options'), 'SAMEORIGIN', 'positive control: the listener site still refuses frames');
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'self'(;|$)/);
  assert.match(await home.text(), /<script src="\/fund-drive\.js\?v=/, 'the capsule script ships with the listener page');
});
