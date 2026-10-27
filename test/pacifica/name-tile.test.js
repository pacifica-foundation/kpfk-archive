'use strict';
// Name tiles for shows on the feed's stand-in picture (2026-10-27, Ace's review: 25 KPFK shows —
// CinemaScore, Counterspin, Making Contact… — all showed Confessor's "KPFK_med.jpg"). The service
// marks such a show, and one with no picture, with `tile`; the web page draws the tile instead.
// `photo` is left as it was (the Flutter app reads it and can't draw SVG).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createService, nameTile } = require('../../lib/pacifica/service');
const { validateProfile } = require('../../lib/station-config');
const profile = validateProfile(require('../../stations/kpfk.json'));
const dir = path.join(__dirname, '../../docs/fixtures/pacifica-kpfk-2026-09-14');
const STAND_IN = 'https://confessor.kpfk.org/pix/KPFK_med.jpg';
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); }
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

// The fixture feed, with `art(show)` deciding each show's photoUrl.
function service(t, art) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpfk-tile-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const fetchImpl = async url => {
    const name = path.basename(new URL(url).pathname), data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (name === 'fe_catalog_kpfk.json') for (const list of Object.values(data.shows)) for (const s of list) s.photoUrl = art(s);
    return json(data);
  };
  return createService({ profile, dataDir, writeJsonAtomic: write, fetchImpl, now: () => 1789435100000 });
}
// Every object in a payload that carries `photo`, with where it is.
function photoHolders(value, where = '$', found = []) {
  if (Array.isArray(value)) value.forEach((v, i) => photoHolders(v, `${where}[${i}]`, found));
  else if (value && typeof value === 'object') {
    if ('photo' in value) found.push([where, value]);
    for (const [k, v] of Object.entries(value)) photoHolders(v, `${where}.${k}`, found);
  }
  return found;
}
async function payloads(s) {
  const catalog = await s.catalog(), index = await s.schedule();
  return { catalog, archive: await s.archive(), week: await s.schedule(index.weeks[0].weekStart), live: await s.live() };
}

test('a stand-in or missing picture gives every payload that carries the photo a tile (episodes, directory, schedule, on air)', async t => {
  const s = service(t, () => STAND_IN);
  let holders = 0;
  for (const [name, payload] of Object.entries(await payloads(s))) {
    const found = photoHolders(payload);
    assert.ok(found.length > 0, `${name}: the probe sees photos`);
    holders += found.length;
    const missing = found.filter(([, o]) => !/^\/api\/artwork\/tile\/[A-Za-z0-9_.-]+$/.test(o.tile || '')).map(([w]) => w);
    assert.deepEqual(missing.slice(0, 5), [], `${name}: ${missing.length} photo(s) without a tile`);
    // photo is untouched: still the proxied stand-in, never the SVG tile.
    assert.ok(found.every(([, o]) => !String(o.photo).includes('/tile/')), `${name}: photo stays as it was`);
  }
  assert.ok(holders > 1000);
  // No picture at all is the same case.
  const none = await service(t, () => '').catalog();
  assert.ok(Object.values(none.directory).every(i => i.tile), 'a show with no picture gets a tile');
});

test('a show with its own picture gets no tile', async t => {
  const s = service(t, x => `https://confessor.kpfk.org/pix/${x.altid}_med_1.jpg`);
  for (const [name, payload] of Object.entries(await payloads(s))) {
    const tiled = photoHolders(payload).filter(([, o]) => 'tile' in o).map(([w]) => w);
    assert.deepEqual(tiled.slice(0, 5), [], `${name}: ${tiled.length} tiled`);
  }
});

test('/tile: the show name, escaped, with no colour coding; unknown shows are refused', async t => {
  const s = service(t, x => x.altid === 'afrodicia' ? STAND_IN : '');
  const catalog = await s.catalog();
  const key = Object.keys(catalog.directory).find(k => k.endsWith('.afrodicia'));
  const svg = s.tile(key).raw.toString();
  assert.match(svg, /^<svg /); assert.match(svg, />Afro-Dicia</); assert.match(svg, /KPFK 90\.7 FM/);
  // Shows are never colour-coded (Paul, 2026-10-27): only the placeholder's own greys and white.
  const fills = new Set([...svg.matchAll(/(?:fill|stop-color)="(#[0-9a-f]{6})"/gi)].map(m => m[1].toLowerCase()));
  assert.deepEqual([...fills].sort(), ['#17191c', '#303337', '#a4adb3', '#f3f4f5'], 'greys and white only');
  assert.equal(s.tile(key, '4fb6ac').raw.toString(), svg, 'a colour passed in is ignored');
  assert.throws(() => s.tile('kpfk.kpfk.nosuchshow'), e => e.status === 404);
  const hostile = nameTile('Tom & Jerry <b>"Live"</b>', 'KPFK');
  assert.doesNotMatch(hostile, /<b>|"Live"/); assert.match(hostile, /&amp;/); assert.match(hostile, /&lt;b&gt;&quot;Live&quot;&lt;\/b&gt;/);
});

test('the tile never breaks a word that fits at a smaller size, and keeps to four lines', () => {
  const lines = svg => [...svg.matchAll(/<text x="40" y="\d+">([^<]*)<\/text>/g)].map(m => m[1]);
  assert.deepEqual(lines(nameTile('CinemaScore', '')), ['CinemaScore']);
  const words = 'Senderos de Oaxaca: Así es Nuestra Cultura'.split(' ');
  const got = lines(nameTile(words.join(' '), ''));
  assert.ok(got.length <= 4); assert.deepEqual(got.join(' ').split(' '), words);
  assert.ok(lines(nameTile('A '.repeat(60) + 'Supercalifragilisticexpialidocious', '')).length <= 4);
});

test('placeholderArt is checked like every other station setting', () => {
  const base = require('../../stations/kpfk.json');
  assert.deepEqual(validateProfile(base).placeholderArt, ['KPFK_med.jpg']);
  assert.throws(() => validateProfile({ ...base, placeholderArt: 'KPFK_med.jpg' }), /placeholderArt must be an array/);
  assert.throws(() => validateProfile({ ...base, placeholderArt: ['../x.jpg'] }), /invalid placeholderArt/);
  assert.deepEqual(validateProfile({ ...base, placeholderArt: undefined }).placeholderArt, []);
});
