'use strict';
// Listener wording (Ace's review, 2026-10-23): "Podcast, not archive", and no vendor or tool
// names (QIR, Confessor, Aiir) in anything a listener reads. Station wording comes from the
// profile's optional `copy` block. These read the rendered page, the share card, the app
// manifest and the transcript note as a listener gets them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const { validateProfile, publicProfile } = require('../../lib/station-config');
const { render, manifest } = require('../../lib/station-view');
const raw = () => JSON.parse(fs.readFileSync(path.join(root, 'stations/kpfk.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
// What a listener can read: text between tags plus title/alt/aria-label/content attributes.
// Comments and scripts are dropped first.
function readable(html) {
  const h = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/g, '');
  const attrs = [...h.matchAll(/\b(?:content|aria-label|alt|title|placeholder)="([^"]*)"/g)].map(m => m[1]);
  return h.replace(/<[^>]+>/g, ' ').concat(' ', attrs.join(' ')).replace(/\s+/g, ' ');
}

test('the page, its share card and the install name say Podcasts, never Archive', () => {
  const profile = validateProfile(raw());
  const page = render(template, profile);
  assert.match(page, /<title>KPFK 90\.7 FM Podcasts<\/title>/);
  assert.match(page, /<span class="brand-name">90\.7 FM · Podcasts<\/span>/);
  assert.match(page, /og:title" content="KPFK 90\.7 FM Podcasts"/);
  const text = readable(page);
  assert.ok(text.length > 2000, 'the probe sees the page text');
  assert.match(text, /Podcasts/, 'the probe can see the word it checks for');
  assert.doesNotMatch(text, /\barchive\b/i);
  const m = manifest(profile);
  assert.doesNotMatch(m.name + ' ' + m.short_name + ' ' + m.description, /archive/i);
});

test('no vendor or tool names in the page or the transcript note', () => {
  const profile = validateProfile(raw());
  assert.doesNotMatch(readable(render(template, profile)), /\b(QIR|Confessor|Aiir)\b/i);
  const note = publicProfile(profile).copy.transcriptNote;
  assert.equal(note, 'Machine transcript. Names and words may be wrong.');
  // along.js builds its note from the station setting, not a literal.
  const along = fs.readFileSync(path.join(root, 'plugins/discovery/public/along.js'), 'utf8');
  assert.match(along, /StationConfig\.copy\.transcriptNote/);
  // Code without its comments: any remaining tool name could only be in a string a listener reads.
  const code = along.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  assert.match(code, /Tap any line to play from there/, 'the probe sees along.js strings');
  assert.doesNotMatch(code, /\b(QIR|Confessor|Aiir)\b/);
});

test('a station sets its own hero text and transcript note; unknown or empty copy is refused', () => {
  const p = raw();
  p.copy = { heroDesc: 'Podcasts from <K> & friends.', transcriptNote: 'Automatic transcript.' };
  const profile = validateProfile(p);
  assert.match(render(template, profile), /<p class="hero-desc" id="heroDesc">Podcasts from &lt;K&gt; &amp; friends\.<\/p>/);
  assert.equal(publicProfile(profile).copy.transcriptNote, 'Automatic transcript.');
  // Without a copy block, the default names the station's city.
  assert.match(render(template, validateProfile(raw())), /id="heroDesc">[^<]*Los Angeles[^<]*podcasts/);
  const bad = raw(); bad.copy = { tagline: 'x' };
  assert.throws(() => validateProfile(bad), /unknown copy key/);
  const empty = raw(); empty.copy = { heroDesc: '  ' };
  assert.throws(() => validateProfile(empty), /copy\.heroDesc/);
});
