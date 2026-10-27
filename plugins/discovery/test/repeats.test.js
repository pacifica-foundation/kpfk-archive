'use strict';
// Re-runs from QIR transcripts (lib/qir/repeats.js; 2026-10-27, Ace's review). Synthetic
// transcripts shaped like the measured archive: a re-run is the same programme transcribed
// again (a few words differ) behind a different top-of-hour; different episodes share only
// station boilerplate; the hard middle case is Law and Disorder's ~47% (repeated fund-drive
// pitches), which must not count; a clipped recording of the same programme must not either.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fingerprint, overlap, sameProgramme, findRepeats, createRepeats, SAME } = require('../lib/qir/repeats');

// mulberry32: unrelated sequences for nearby seeds (a plain LCG gives seed 1 and 2 the same
// sequence one step apart, which made "different" episodes the same text).
function rng(seed) {
  let a = Math.imul(seed, 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const VOCAB = Array.from({ length: 3000 }, (_, i) => 'w' + i.toString(36) + 'ab'.slice(i % 2));
function words(seed, n) { const r = rng(seed); return Array.from({ length: n }, () => VOCAB[Math.floor(r() * VOCAB.length)]); }
// ASR noise: a share of the words come out differently on the second pass.
function noisy(list, seed, share) { const r = rng(seed); return list.map(w => r() < share ? VOCAB[Math.floor(r() * VOCAB.length)] : w); }
const ID = n => words(9000 + n, 250);                 // a top-of-hour: IDs, promos (differs per airing)
const BODY = n => words(n, 8000);                      // an hour of talk
const text = list => list.join(' ');

test('a re-run matches; a different episode, a fund-drive overlap and a clipped recording do not', () => {
  const first = fingerprint(text([...ID(1), ...BODY(1)]));
  const rerun = fingerprint(text([...ID(2), ...noisy(BODY(1), 7, 0.03)]));
  const other = fingerprint(text([...ID(3), ...BODY(2)]));
  const pitch = words(500, 3600);   // ~45% of the hour: the same fund-drive pitches
  const driveA = fingerprint(text([...ID(4), ...pitch, ...words(3, 4400)]));
  const driveB = fingerprint(text([...ID(5), ...pitch, ...words(4, 4400)]));
  const clipped = fingerprint(text(BODY(1).slice(0, 3000)));
  assert.ok(overlap(first.sample, rerun.sample) >= 0.7, 'a re-run shares most of its runs');
  assert.ok(overlap(first.sample, other.sample) < 0.1);
  const mid = overlap(driveA.sample, driveB.sample);
  assert.ok(mid > 0.3 && mid < SAME, `the fund-drive case sits in the gap (${mid.toFixed(2)})`);
  assert.equal(sameProgramme(first, rerun), true);
  assert.equal(sameProgramme(first, other), false);
  assert.equal(sameProgramme(driveA, driveB), false);
  assert.equal(sameProgramme(first, clipped), false, 'a clipped recording is not a re-run of the full one');
  assert.equal(sameProgramme(fingerprint('too short to judge'), fingerprint('too short to judge')), false);
  // The kept sample is small: about one run in 32.
  assert.ok(first.sample.length > 150 && first.sample.length < 400, String(first.sample.length));
  // Accented words count as words (Spanish programmes).
  assert.equal(fingerprint('canción niño José árbol').words, 4);
});

test('re-runs group under the first airing, within a show only', () => {
  const p = new Map(), rows = [];
  const add = (mp3, sho, dt, t) => { rows.push({ mp3, sho, dt }); p.set(mp3, fingerprint(text(t))); };
  // Luke: one programme aired three times, out of order in the list.
  add('luke-oct14', 'luke', 300, [...ID(10), ...noisy(BODY(10), 1, 0.03)]);
  add('luke-sep16', 'luke', 100, [...ID(11), ...BODY(10)]);
  add('luke-oct07', 'luke', 200, [...ID(12), ...noisy(BODY(10), 2, 0.03)]);
  add('luke-other', 'luke', 250, [...ID(13), ...BODY(11)]);
  // Democracy Now: the 4 pm repeat the same day.
  add('dn-0700', 'dn', 1000, [...ID(20), ...BODY(20)]);
  add('dn-1600', 'dn', 1032, [...ID(21), ...noisy(BODY(20), 3, 0.03)]);
  // The same programme filed under another show is not this rule's business.
  add('other-show', 'nader', 150, [...ID(30), ...BODY(10)]);
  rows.push({ mp3: 'not-read-yet', sho: 'luke', dt: 400 });
  const r = findRepeats(rows, p);
  assert.deepEqual(Object.fromEntries([...r].sort()), { 'dn-1600': 'dn-0700', 'luke-oct07': 'luke-sep16', 'luke-oct14': 'luke-sep16' });
});

// A fake QIR: processed episodes (updated_at set) have transcripts; one not yet processed.
function fakeQir(transcripts, { missing = [] } = {}) {
  const asked = [];
  return { asked,
    catalog: async () => ({ episodes: Object.keys(transcripts).map((mp3, i) => ({ public_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      mp3_url: mp3, updated_at: mp3 === 'unprocessed' ? '' : '2026-10-27T00:00:00Z' })) }),
    async transcriptText(id) {
      const mp3 = Object.keys(transcripts)[Number(id.slice(-12))]; asked.push(mp3);
      if (missing.includes(mp3)) throw Object.assign(new Error('not_found'), { status: 404 });
      return transcripts[mp3];
    } };
}

test('the reader: newest first, one transcript per step, saved across a restart, aged-out episodes dropped', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-reruns-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tx = { a: text([...ID(1), ...BODY(1)]), b: text([...ID(2), ...noisy(BODY(1), 5, 0.03)]), c: text([...ID(3), ...BODY(3)]), gone: text(BODY(4)), unprocessed: 'x', late: 'y' };
  const rows = [{ mp3: 'a', sho: 's', dt: 1 }, { mp3: 'b', sho: 's', dt: 2 }, { mp3: 'c', sho: 's', dt: 3 }, { mp3: 'gone', sho: 's', dt: 0 },
    { mp3: 'unprocessed', sho: 's', dt: 9 }, { mp3: 'late', sho: 's', dt: 8 }];
  let clock = 0;
  const qir = fakeQir(tx, { missing: ['late'] });
  const r = createRepeats({ qir, dir, now: () => clock });
  assert.equal(r.apply(rows, 'v1').size, 0, 'nothing is hidden before any transcript is read');
  assert.equal(await r.step(), true); assert.deepEqual(qir.asked, ['late'], 'newest processed first');
  while (await r.step());
  assert.deepEqual(qir.asked, ['late', 'c', 'b', 'a', 'gone'], 'unprocessed is never asked for; each read once');
  assert.deepEqual(Object.fromEntries(r.apply(rows, 'v1')), { b: 'a' });
  assert.deepEqual(r.status(), { fingerprinted: 4, episodes: 6, repeats: 1 });
  // QIR said no transcript for "late": asked again only after a day.
  assert.equal(await r.step(), false);
  clock += 24 * 3600000 + 1;
  assert.equal(await r.step(), true); assert.equal(qir.asked.at(-1), 'late');
  // Restart: the saved fingerprints answer at once, with no transcript read.
  const again = createRepeats({ qir: fakeQir(tx), dir, now: () => clock });
  assert.deepEqual(Object.fromEntries(again.apply(rows, 'v1')), { b: 'a' });
  // "gone" leaves the archive: its fingerprint is dropped and the file shrinks.
  again.apply(rows.filter(x => x.mp3 !== 'gone'), 'v2');
  await again.step();
  assert.ok(!JSON.parse(fs.readFileSync(path.join(dir, 'repeats.json'), 'utf8')).prints.gone);
  // A damaged file starts over instead of failing the plugin.
  fs.writeFileSync(path.join(dir, 'repeats.json'), '{not json');
  const warned = [];
  const fresh = createRepeats({ qir: fakeQir(tx), dir, log: { warn: m => warned.push(m) } });
  assert.equal(fresh.apply(rows, 'v1').size, 0); assert.match(warned[0], /unreadable/);
});

test('QIR unavailable: the step fails loudly and nothing is guessed', async () => {
  const qir = { catalog: async () => ({ episodes: [{ public_id: '00000000-0000-4000-8000-000000000000', mp3_url: 'a', updated_at: 'x' }] }),
    transcriptText: async () => { throw Object.assign(new Error('provider_temporarily_unavailable'), { status: 503 }); } };
  const r = createRepeats({ qir });
  r.apply([{ mp3: 'a', sho: 's', dt: 1 }], 'v');
  await assert.rejects(r.step(), /provider_temporarily_unavailable/);
  assert.equal(r.status().fingerprinted, 0);
});

test('the plugin hides nothing while Discovery or QIR is switched off', () => {
  const { createApp } = require('./harness');
  const rows = [{ mp3: 'a', sho: 's', dt: 1 }];
  const off = createApp({ switchedOn: false }).discovery;
  assert.equal(typeof off.repeatsFor, 'function');
  assert.equal(off.repeatsFor(rows, 'v').size, 0);
  const on = createApp({ env: { QIR_API_KEY: 'k' } }).discovery;
  on.settings.setQir(false);
  assert.equal(on.repeatsFor(rows, 'v').size, 0);
  assert.deepEqual(on.status().reruns, { fingerprinted: 0, episodes: 0, repeats: 0 });
});
