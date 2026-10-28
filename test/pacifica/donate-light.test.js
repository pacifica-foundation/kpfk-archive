'use strict';
// The donate page's light version (links.donateLight, Paul 2026-10-28): the Donate window shows it
// when the site is in light mode, because a page inside the window cannot follow our theme itself.
// Optional, validated like every link, never a menu item, allowed in the Donate window (frame-src).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateProfile, publicProfile, LINK_KEYS } = require('../../lib/station-config');
const { menu } = require('../../lib/station-view');
const base = require('../../stations/kpfk.json');

test('KPFK has a light donate page beside the dark one, and listeners get it', () => {
  const links = publicProfile(validateProfile(base)).links;
  assert.equal(links.donateLight, 'https://docs.pacifica.org/kpfk/donate/light.html');
  assert.equal(new URL(links.donateLight).origin, new URL(links.donate).origin, 'same site as the dark page');
  assert.ok(LINK_KEYS.includes('donateLight'), 'editable in the studio like the other links');
});

test('optional, and a bad address is refused', () => {
  const { donateLight, ...rest } = base.links;
  assert.equal(validateProfile({ ...base, links: rest }).links.donateLight, undefined);
  assert.throws(() => validateProfile({ ...base, links: { ...base.links, donateLight: 'javascript:alert(1)' } }));
});

test('never a side-menu item', () => {
  const html = Object.values(menu(validateProfile(base))).join("");   // every menu group's markup
  assert.match(html, /docs\.pacifica\.org\/kpfk\/donate\//, 'positive control: the Donate item is there');
  assert.doesNotMatch(html, /light\.html/);
});

test('the copy committed in docs/ is the light version: no dark palette left', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../docs/kpfk/donate-page/light.html'), 'utf8');
  assert.match(page, /--background: #F6F1EA/);
  assert.doesNotMatch(page, /#000000|#121212|rgba\(255, 255, 255/);
  assert.match(page, /src="header\.png"/, 'the same logo file as the dark page (same folder)');
});
