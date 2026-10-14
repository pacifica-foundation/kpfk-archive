'use strict';
// Studio days are the station's calendar days (2026-10-13). They were UTC days: from 5 pm in
// Los Angeles every play was filed under tomorrow (Paul saw "10-14" on the 13th), and on the last
// evening of a month under next month's stats file. A real server runs with its clock pinned to
// those evenings and receives a real beacon; the test reads where it landed — in the studio's
// report and in the stats file on disk. Shown to fail on the UTC code.
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

test('a beacon in a Los Angeles evening counts on that day and in that month, not UTC tomorrow', { timeout: 60000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-day-'));
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
  let child = null;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    await new Promise(r => upstream.close(r)); fs.rmSync(tmp, { recursive: true, force: true });
  });

  // [clock (UTC), the Los Angeles calendar day it is, the UTC day the old code used]
  const evenings = [
    ['2026-10-14T03:00:00Z', '2026-10-13', '2026-10-14'],   // 8 pm PDT, Oct 13
    ['2026-11-01T06:30:00Z', '2026-10-31', '2026-11-01'],   // 11:30 pm PDT, Oct 31: month boundary
  ];
  for (const [clock, localDay, utcDay] of evenings) {
    const dataDir = path.join(tmp, 'data-' + localDay);
    const port = await freePort(), url = `http://127.0.0.1:${port}`;
    let logs = '';
    child = spawn(process.execPath, ['-r', path.join(__dirname, 'helpers/fixed-clock.cjs'), 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...cleanEnv(), FAKE_NOW_MS: String(Date.parse(clock)), STATION_PROFILE: profileFile, PACIFICA_TEST_LOCAL: '1', STUDIO_PASSWORD: 'pw',
        PORT: String(port), DATA_DIR: dataDir, ARTWORK_WARM: 'off', AUDIO_CHECK: 'off' } });
    child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
    for (let i = 0; i < 200; i++) { if (child.exitCode !== null) throw new Error(logs); try { if ((await fetch(url + '/healthz')).ok) break; } catch {} await sleep(30); }

    const beacon = await fetch(url + '/api/ev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: 'pageview', z: 'America/Los_Angeles' }) });
    assert.equal(beacon.status, 204);
    const login = await fetch(url + '/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const usage = await (await fetch(url + '/api/studio/usage', { headers: { Cookie: cookie } })).json();

    // The report: the last day of the window is the station's today, and the page view is on it.
    const last = usage.days[usage.days.length - 1];
    assert.equal(last.day, localDay, `${clock}: the chart's last day`);
    assert.equal(last.pageviews, 1, `${clock}: the page view counts on ${localDay}`);
    assert.ok(!usage.days.some(d => d.day === utcDay), `${clock}: no ${utcDay} (UTC tomorrow) in the window`);
    assert.equal(usage.month, localDay.slice(0, 7), `${clock}: the month being written`);

    // On disk, after a clean stop (the store flushes on exit): the month file of the LOCAL day.
    child.kill('SIGTERM'); await new Promise(r => child.once('exit', r));
    const file = path.join(dataDir, 'stats', localDay.slice(0, 7) + '.json');
    assert.ok(fs.existsSync(file), `${clock}: ${path.basename(file)} written`);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).days[localDay].pageviews, 1, `${clock}: stored on ${localDay}`);
    assert.ok(!fs.existsSync(path.join(dataDir, 'stats', utcDay.slice(0, 7) + '.json')) || utcDay.slice(0, 7) === localDay.slice(0, 7),
      `${clock}: nothing in the UTC month's file`);
  }
});
