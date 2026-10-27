'use strict';
// Re-runs in the archive filter (2026-10-27, Ace's review: Nader Sep 27 and Oct 4 are the same
// programme). The Discovery plugin finds them (plugins/discovery/lib/qir/repeats.js); the
// service hides every later airing, gives the first `alsoAired`, moves the revision so open
// pages update, and reports each in `filter.repeats` and the studio's feed anomalies.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createService } = require('../../lib/pacifica/service');
const { validateProfile } = require('../../lib/station-config');
const profile = validateProfile(require('../../stations/kpfk.json'));
const dir = path.join(__dirname, '../../docs/fixtures/pacifica-kpfk-2026-09-14');
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); }
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
function fixtureService(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-reruns-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const fetchImpl = async url => json(JSON.parse(fs.readFileSync(path.join(dir, path.basename(new URL(url).pathname)), 'utf8')));
  return createService({ profile, dataDir, writeJsonAtomic: write, fetchImpl, now: () => 1789435100000, audioCheck: false });
}

test('a later airing is hidden, the first lists it, the revision moves, and it is reported', async t => {
  const s = fixtureService(t);
  const before = await s.archive();
  // Three airings of one show: the oldest is the first airing; the other two repeat it.
  const byShow = {};
  for (const r of before.shows) (byShow[r.sho] = byShow[r.sho] || []).push(r);
  const eps = Object.values(byShow).find(l => l.length >= 4).sort((a, b) => a.dt - b.dt);
  const [first, , second, third] = eps;
  let asked = null;
  s.setRepeats((rows, key) => { asked = { rows, key }; return new Map([[third.mp3, first.mp3], [second.mp3, first.mp3]]); });
  const after = await s.archive();
  assert.ok(asked.rows.some(r => r.mp3 === third.mp3), 'the finder sees the rows before anything is hidden');
  assert.equal(after.shows.length, before.shows.length - 2);
  assert.equal(after.count, after.shows.length);
  assert.ok(!after.shows.some(r => r.id === second.id || r.id === third.id), 'later airings are hidden');
  assert.deepEqual(after.shows.find(r => r.id === first.id).alsoAired, [{ id: second.id, dt: second.dt }, { id: third.id, dt: third.dt }], 'the first lists them, oldest first');
  // A link to a hidden airing opens the programme at its first airing (public/links.js).
  const links = require('../../public/links.js');
  const found = links.resolve(links.parse(links.episodePath(third)), after.shows, after.directory);
  assert.equal(found.row.id, first.id); assert.equal(found.rotated, false);
  assert.notEqual(after.revision, before.revision, 'open pages see a new listing');
  assert.deepEqual(after.filter.repeats.map(r => [r.id, r.of]).sort(), [[second.id, first.id], [third.id, first.id]].sort());
  const anomalies = s.anomalies().items.filter(i => i.kind === 'rerun');
  assert.equal(anomalies.length, 2); assert.match(anomalies[0].detail, /same programme as .+ — hidden/);
});

test('a re-run whose first airing is not served stays; a failing finder hides nothing', async t => {
  const s = fixtureService(t);
  const before = await s.archive();
  const row = before.shows[0];
  s.setRepeats(() => new Map([[row.mp3, 'https://archive.kpfk.org/mp3/not-in-the-archive.mp3']]));
  assert.equal((await s.archive()).shows.length, before.shows.length, 'never hidden in favour of something nobody can play');
  s.setRepeats(() => { throw new Error('plugin bug'); });
  const warn = console.warn; const warned = []; console.warn = m => warned.push(m);
  try { assert.equal((await s.archive()).shows.length, before.shows.length); } finally { console.warn = warn; }
  assert.match(warned.join('\n'), /re-run check failed, nothing hidden: plugin bug/);
});
