'use strict';
// Station contact block (2026-10-27, Listen Live page): how listeners reach the station. Optional
// fields; a blank one is not shown; bad values refused at load, like every other station setting.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProfile, publicProfile } = require('../../lib/station-config');
const base = require('../../stations/kpfk.json');

test('KPFK: call-in, office and signals reach the page; studio email and text number are absent until set', () => {
  const c = publicProfile(validateProfile(base)).contact;
  assert.equal(c.studioPhone, '(818) 985-5735'); assert.equal(c.officePhone, '(818) 985-2711');
  assert.equal(c.signals.length, 4);
  assert.ok(!('studioEmail' in c) && !('textNumber' in c), 'not set = not shown');
});
test('no contact block at all is fine (other stations)', () => {
  const { contact, ...rest } = base;
  assert.deepEqual(publicProfile(validateProfile(rest)).contact, {});
});
test('bad values are refused', () => {
  for (const bad of [{ studioEmail: 'not an email' }, { studioPhone: 'call us' }, { studioPhone: '123' }, { fax: '(818) 555-1212' },
    { signals: 'one string' }, { signals: ['x'.repeat(61)] }, { textNumber: '<script>' }])
    assert.throws(() => validateProfile({ ...base, contact: bad }), /contact/, JSON.stringify(bad));
  assert.equal(validateProfile({ ...base, contact: { studioEmail: 'studio@kpfk.org', textNumber: '+1 818 555 0100' } }).contact.studioEmail, 'studio@kpfk.org');
});
