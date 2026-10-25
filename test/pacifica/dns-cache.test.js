'use strict';
// lib/dns-cache.js (2026-10-25). Live: the container's resolver timed out now and then
// (`getaddrinfo EAI_AGAIN qir.kpfk.org`) and every outbound request failed while it did.
// Class: any outbound request (global fetch or http/https) during a temporary DNS failure.
// These go through real fetch and http.get to a local server, so they also prove that Node
// still routes connections through dns.lookup; if that ever changes, the cache does nothing
// and these fail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns');
const http = require('node:http');
const { createDnsCache } = require('../../lib/dns-cache');

function fakeResolver() {
  const r = { mode: 'ok', calls: 0 };
  r.lookup = (host, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    r.calls++;
    if (host !== 'qir.test') return cb(Object.assign(new Error('getaddrinfo ENOTFOUND ' + host), { code: 'ENOTFOUND' }));
    if (r.mode !== 'ok') return cb(Object.assign(new Error('getaddrinfo ' + r.mode + ' ' + host), { code: r.mode }));
    const all = typeof options === 'object' && options.all;
    return all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4);
  };
  return r;
}

async function withServer(t) {
  // Connection: close, so no request rides on an earlier one's socket and skips the lookup.
  const server = http.createServer((req, res) => { res.setHeader('Connection', 'close'); res.end('ok'); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  return server.address().port;
}

function install(t, cache) {
  const original = dns.lookup;
  dns.lookup = cache.lookup;
  t.after(() => { dns.lookup = original; });
}

const viaFetch = async url => (await (await fetch(url)).text());
const viaHttp = url => new Promise((resolve, reject) => http.get(url, { agent: false }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b)); }).on('error', reject));

for (const [name, get] of [['fetch', viaFetch], ['http.get', viaHttp]]) {
  for (const code of ['EAI_AGAIN', 'ETIMEOUT']) {
    test(`${name}: a temporary DNS failure (${code}) uses the last good answer and is counted`, async t => {
      const port = await withServer(t), resolver = fakeResolver();
      let clock = 1_000_000;
      const cache = createDnsCache({ lookup: resolver.lookup, now: () => clock, log: () => {} });
      install(t, cache);
      assert.equal(await get(`http://qir.test:${port}/`), 'ok');
      resolver.mode = code; clock += 120000; // past freshMs, so the resolver is asked and fails
      assert.equal(await get(`http://qir.test:${port}/`), 'ok', 'the request still connects');
      assert.equal(cache.status().servedStale, 1);
      assert.equal(cache.status().last.error, code);
      assert.equal(cache.status().last.host, 'qir.test');
    });
  }
  test(`${name}: without the cache the same failure breaks the request (the test can see the failure)`, async t => {
    const port = await withServer(t), resolver = fakeResolver();
    resolver.mode = 'EAI_AGAIN';
    const original = dns.lookup; dns.lookup = resolver.lookup; t.after(() => { dns.lookup = original; });
    await assert.rejects(get(`http://qir.test:${port}/`));
  });
}

test('a fresh answer is reused without asking; an old one is asked again', async t => {
  const port = await withServer(t), resolver = fakeResolver();
  let clock = 1_000_000;
  const cache = createDnsCache({ lookup: resolver.lookup, now: () => clock, freshMs: 60000, log: () => {} });
  install(t, cache);
  await viaHttp(`http://qir.test:${port}/`);
  const asked = resolver.calls;
  clock += 30000; await viaHttp(`http://qir.test:${port}/`);
  assert.equal(resolver.calls, asked, 'within a minute the resolver is not asked');
  clock += 31000; await viaHttp(`http://qir.test:${port}/`);
  assert.equal(resolver.calls, asked + 1, 'after a minute it is asked again (address changes are seen)');
});

test('a name that does not exist is never covered up, and an answer older than a day is not used', async t => {
  const port = await withServer(t), resolver = fakeResolver();
  let clock = 1_000_000;
  const cache = createDnsCache({ lookup: resolver.lookup, now: () => clock, log: () => {} });
  install(t, cache);
  await assert.rejects(viaHttp(`http://missing.test:${port}/`), e => e.code === 'ENOTFOUND');
  await viaHttp(`http://qir.test:${port}/`);
  resolver.mode = 'EAI_AGAIN'; clock += 86400000 + 1;
  await assert.rejects(viaHttp(`http://qir.test:${port}/`), e => e.code === 'EAI_AGAIN');
  assert.equal(cache.status().servedStale, 0);
  assert.equal(cache.status().failed, 2);
});
