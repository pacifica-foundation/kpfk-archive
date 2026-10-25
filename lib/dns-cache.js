'use strict';
// DNS answers remembered for the whole process (2026-10-25).
//
// Why: Node keeps no DNS cache, so every outbound request (Pacifica feeds, artwork, live stream,
// QIR) asks the resolver again. On the production container (node:24-alpine, musl, Contabo's
// resolvers) some lookups time out after ~5 s with EAI_AGAIN; on 2026-10-25 that cut QIR off
// three times in two hours. Live status showed `getaddrinfo EAI_AGAIN qir.kpfk.org`.
//
// What: wraps dns.lookup, which both global fetch and http/https use for every connection.
//   - an answer younger than freshMs is reused without asking (fewer lookups, no 5 s stalls);
//   - older answers are re-asked, so a changed address is picked up within freshMs;
//   - when asking fails with a temporary error and an answer younger than staleMaxMs exists,
//     that answer is used and counted in status() (served on /healthz as `dns`).
// A permanent answer (ENOTFOUND: the name doesn't exist) is never covered up.
// The planned fix outside the code is a reliable resolver for the container (docs/DEPLOYMENT.md,
// "DNS"); this cache stays useful after it.
const dns = require('node:dns');

const TEMPORARY = new Set(['EAI_AGAIN', 'ETIMEOUT', 'ECONNREFUSED', 'ESERVFAIL', 'EAI_FAIL', 'EAI_SYSTEM']);

function createDnsCache({ lookup = dns.lookup, now = Date.now, freshMs = 60000, staleMaxMs = 86400000, log = m => console.warn(m) } = {}) {
  const answers = new Map();           // key -> {args: [address|addresses, family], at}
  const stats = { lookups: 0, reused: 0, servedStale: 0, failed: 0, last: null };
  function cached(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    const opts = typeof options === 'number' ? { family: options } : (options || {});
    const key = `${hostname}|${opts.family || 0}|${opts.all ? 1 : 0}|${opts.hints || 0}`;
    const hit = answers.get(key);
    if (hit && now() - hit.at < freshMs) {
      stats.reused++;
      process.nextTick(callback, null, ...hit.args);
      return {};
    }
    stats.lookups++;
    lookup.call(dns, hostname, options, (err, ...args) => {
      if (!err) { answers.set(key, { args, at: now() }); return callback(null, ...args); }
      if (hit && TEMPORARY.has(err.code) && now() - hit.at < staleMaxMs) {
        stats.servedStale++;
        stats.last = { at: new Date(now()).toISOString(), host: hostname, error: err.code, answerAgeSec: Math.round((now() - hit.at) / 1000) };
        log(`[dns] ${hostname}: ${err.code}; using the last good answer (${stats.last.answerAgeSec} s old)`);
        return callback(null, ...hit.args);
      }
      stats.failed++;
      stats.last = { at: new Date(now()).toISOString(), host: hostname, error: err.code || err.message, answerAgeSec: null };
      callback(err);
    });
    return {};
  }
  return { lookup: cached, status: () => ({ ...stats, hosts: answers.size }) };
}

// Replaces dns.lookup for the process once; later calls return the same cache.
let installed = null;
function installDnsCache(options) {
  if (installed) return installed;
  installed = createDnsCache(options);
  dns.lookup = installed.lookup;
  return installed;
}

module.exports = { createDnsCache, installDnsCache };
