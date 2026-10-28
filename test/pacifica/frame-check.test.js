'use strict';
// Donate link check (lib/frame-check.js, 2026-10-28): will a page show inside the Donate window,
// and is the fetch fenced (https, public addresses only, every redirect checked, headers only)?
// No network: lookup and request are stand-ins.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const C = require('../../lib/frame-check');
const OURS = 'https://podcast.kpfk.org';

test('reading the headers: X-Frame-Options and CSP frame-ancestors, as a browser does', () => {
  const v = h => C.framingVerdict(h, OURS).frames;
  assert.equal(v({}), true, 'no rule: it shows');
  assert.equal(v({ 'x-frame-options': 'DENY' }), false);
  assert.equal(v({ 'x-frame-options': 'sameorigin' }), false);
  assert.equal(v({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }), false);
  assert.equal(v({ 'content-security-policy': "frame-ancestors 'self'" }), false, "'self' is their site, not ours");
  assert.equal(v({ 'content-security-policy': 'frame-ancestors https://podcast.kpfk.org' }), true);
  assert.equal(v({ 'content-security-policy': 'frame-ancestors *.kpfk.org' }), true);
  assert.equal(v({ 'content-security-policy': 'frame-ancestors https://evil-kpfk.org' }), false);
  assert.equal(v({ 'content-security-policy': 'frame-ancestors *' }), true);
  assert.equal(v({ 'content-security-policy': 'frame-ancestors https:' }), true);
  assert.equal(v({ 'x-frame-options': 'DENY', 'content-security-policy': 'frame-ancestors *' }), true, 'frame-ancestors wins');
  assert.equal(v({ 'content-security-policy': ['script-src x', 'frame-ancestors https://other.org'] }), false, 'several CSP headers');
});

test('the addresses it will never fetch', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])
    assert.equal(C.isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '104.16.0.1', '2606:4700::1111']) assert.equal(C.isPrivateAddress(ip), false, ip);
  for (const bad of ['http://x.org/', 'ftp://x.org/', 'https://u:p@x.org/', 'https://x.org:8443/', 'nope', ''])
    assert.equal(C.checkLinkShape(bad).ok, false, bad);
  assert.equal(C.checkLinkShape('https://x.org/give').ok, true);
});

// A stand-in for https.request: answers from a table keyed by host+path; records what was asked.
function fakeNet(routes, dnsTable) {
  const asked = [];
  const lookup = (host, opts, cb) => { const a = dnsTable[host]; return a ? cb(null, a.map(address => ({ address, family: 4 }))) : cb(new Error('ENOTFOUND')); };
  const request = (o, onRes) => {
    const req = new EventEmitter();
    req.setTimeout = () => {}; req.destroy = e => req.emit('error', e);
    req.end = () => {
      asked.push(o.host + o.path);
      o.lookup(o.host, {}, (err, address) => {
        const r = routes[o.host + o.path] || { status: 404 };
        const res = new EventEmitter(); res.statusCode = r.status; res.headers = r.headers || {}; res.destroy = () => {};
        res.connectedTo = address;
        onRes(res);
      });
    };
    return req;
  };
  return { lookup, request, asked };
}

test('checkFraming: follows a redirect, reports a refusing page, and never reaches an inside address', async () => {
  const net = fakeNet({
    'give.example.org/kpfk': { status: 302, headers: { location: 'https://pay.example.com/form' } },
    'pay.example.com/form': { status: 200, headers: { 'x-frame-options': 'DENY' } },
    'ok.example.org/': { status: 200, headers: {} },
    'sneaky.example.org/': { status: 301, headers: { location: 'https://inside.example.org/' } },
    'loop.example.org/': { status: 302, headers: { location: '/' } },
  }, { 'give.example.org': ['93.184.216.34'], 'pay.example.com': ['93.184.216.35'], 'ok.example.org': ['93.184.216.36'],
    'sneaky.example.org': ['93.184.216.37'], 'inside.example.org': ['10.0.0.5'], 'loop.example.org': ['93.184.216.38'], 'mixed.example.org': ['93.184.216.39', '127.0.0.1'] });
  const opts = { ourOrigin: OURS, lookup: net.lookup, request: net.request };

  const refused = await C.checkFraming('https://give.example.org/kpfk', opts);
  assert.equal(refused.ok, true); assert.equal(refused.frames, false); assert.match(refused.reason, /DENY/);
  assert.equal(refused.finalUrl, 'https://pay.example.com/form');

  const fine = await C.checkFraming('https://ok.example.org/', opts);
  assert.equal(fine.ok, true); assert.equal(fine.frames, true, 'positive control: a page with no rule shows');

  net.asked.length = 0;
  const sneaky = await C.checkFraming('https://sneaky.example.org/', opts);
  assert.equal(sneaky.ok, false); assert.match(sneaky.error, /public internet/);
  assert.deepEqual(net.asked, ['sneaky.example.org/'], 'the redirect to an inside address was never requested');

  const mixed = await C.checkFraming('https://mixed.example.org/', opts);
  assert.equal(mixed.ok, false, 'a name with any inside address is refused');
  assert.equal((await C.checkFraming('https://loop.example.org/', opts)).ok, false, 'too many redirects');
  assert.equal((await C.checkFraming('https://nowhere.example.org/', opts)).ok, false, 'unknown name');
  assert.equal((await C.checkFraming('https://10.0.0.1/', opts)).ok, false, 'an inside address typed directly');
});
