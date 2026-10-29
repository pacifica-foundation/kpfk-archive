'use strict';
// The KPFK desktop app (Tauri, desktop/) is built in GitHub Actions from a station profile.
// A CI build can't be eyeballed before it ships, so these check what it would bake in:
// KPFK's own icons (the shared set under icons/ is WBAI's), every file the profile names,
// and the address the window loads, which must be the station's own main address.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const tauri = path.join(root, 'desktop/src-tauri');
const profile = JSON.parse(fs.readFileSync(path.join(tauri, 'stations/kpfk.json'), 'utf8'));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// Every file path the profile hands the bundler, wherever it sits in the profile.
function paths(v, out = []) {
  if (typeof v === 'string' && /\.(png|ico|icns|bmp)$/.test(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach(x => paths(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => paths(x, out));
  return out;
}

test('every file the KPFK desktop profile names exists', () => {
  const files = paths(profile);
  assert.ok(files.length >= 9, `the probe sees the profile's files (${files.length})`);
  for (const f of files) assert.ok(fs.existsSync(path.join(tauri, f)), `missing ${f}`);
});

test('the KPFK desktop app ships KPFK icons, not the shared WBAI set', () => {
  const own = profile.bundle.icon;
  assert.ok(own.length >= 5 && own.some(f => f.endsWith('.ico')), 'the profile names its own icons, including the Windows .ico');
  const shared = new Set(fs.readdirSync(path.join(tauri, 'icons')).map(f => sha(path.join(tauri, 'icons', f))));
  assert.ok(shared.size >= 5, 'the probe sees the shared icons');
  for (const f of [...own, profile.bundle.windows.nsis.installerIcon]) {
    assert.ok(!shared.has(sha(path.join(tauri, f))), `${f} is byte-identical to a WBAI icon`);
  }
  // Tauri needs 32-bit RGBA PNGs (docs/TAURI.md): colour type 6 at byte 25.
  for (const f of own.filter(f => f.endsWith('.png'))) {
    assert.equal(fs.readFileSync(path.join(tauri, f))[25], 6, `${f} must be RGBA`);
  }
});

test("the desktop window loads the station's own main address", () => {
  const urls = JSON.parse(fs.readFileSync(path.join(root, 'desktop/stations.json'), 'utf8'));
  const station = JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json'), 'utf8'));
  assert.equal(urls.kpfk.url, station.siteUrl);
  assert.match(profile.identifier, /^podcast\.pacifica\.kpfk\./, 'KPFK app family identifier');
  assert.notEqual(profile.identifier, 'podcast.pacifica.kpfk', 'not the iPhone app\'s identifier');
});

test('the Windows workflow is on and builds KPFK by default', () => {
  const wf = path.join(root, '.github/workflows/desktop-windows.yml');
  assert.ok(fs.existsSync(wf), 'desktop-windows.yml is enabled');
  const text = fs.readFileSync(wf, 'utf8');
  assert.match(text, /default: "kpfk"/);
  assert.match(text, /STATION="kpfk"/);
  assert.doesNotMatch(text, /STATION="wbai"|default: "wbai"/);
});
