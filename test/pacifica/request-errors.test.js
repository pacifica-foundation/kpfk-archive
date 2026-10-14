'use strict';
// One route's bug must not stop the server (2026-10-13). The studio, exports and every POST ran
// before the handler's try/catch; an error there was an unhandled rejection and Node exited, so a
// bad studio download took the listener site down. Here a real server runs with one studio export
// made to throw: that request gets a 500, the stack is logged, and the site keeps answering.
// Shown to fail on the code without the top-level catch (the server process exits).
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
function cleanEnv() { const env = { ...process.env }; for (const k of ['STATION_PROFILE', 'STATION_PROVIDER', 'STATION_ID', 'STATION_TZ', 'STUDIO_PASSWORD']) delete env[k]; return env; }
async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

test('a route that throws answers 500, logs the stack, and the server keeps serving', { timeout: 60000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-errors-'));
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
  const profileFile = path.join(tmp, 'profile.json'); fs.writeFileSync(profileFile, JSON.stringify(profile));
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['-r', path.join(__dirname, 'helpers/throw-in-profile-export.cjs'), 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...cleanEnv(), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', STUDIO_PASSWORD: 'pw', PORT: String(port),
      DATA_DIR: path.join(tmp, 'data'), ARTWORK_WARM: 'off', AUDIO_CHECK: 'off' } });
  child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    await new Promise(r => upstream.close(r)); fs.rmSync(tmp, { recursive: true, force: true });
  });
  for (let i = 0; i < 200; i++) { if (child.exitCode !== null) throw new Error(logs); try { if ((await fetch(url + '/healthz')).ok) break; } catch {} await sleep(30); }

  const login = await fetch(url + '/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  // Positive control: another studio export still works, so the probe can tell "broken route" from "no studio".
  assert.equal((await fetch(url + '/api/studio/exports', { headers: { Cookie: cookie } })).status, 200);

  const bad = await fetch(url + '/api/studio/export?dataset=profile&format=json', { headers: { Cookie: cookie } });
  assert.equal(bad.status, 500, 'the failing request is answered, not dropped');
  assert.deepEqual(await bad.json(), { error: 'internal error' }, 'no internals in the answer');
  await sleep(200);
  assert.equal(child.exitCode, null, 'the server process is still running');
  assert.match(logs, /unhandled in GET \/api\/studio\/export/, 'the failure is logged with its route');
  assert.match(logs, /planted failure in a studio route\n\s+at /, 'with its stack');

  // Everyone else is still served: the listener API and the page.
  assert.equal((await fetch(url + '/healthz')).status, 200);
  assert.equal((await fetch(url + '/api/station')).status, 200);
  assert.equal((await fetch(url + '/')).status, 200);
});
