'use strict';

/**
 * Will a page show inside our Donate window? (Fund drive donate link, Paul 2026-10-28.)
 *
 * The studio's Fund drive card takes a donate link; on Listen Live it opens in the window over the
 * page (an iframe). Many payment pages refuse to be shown inside another site's window, and the
 * browser then draws an empty box. This reads the page's headers once, when the link is typed, so
 * the studio can say so before the drive is switched on. Advice only: it never blocks a save.
 *
 * It fetches an address someone typed, from inside the server, so it is fenced:
 *   https only, port 443; every address the name resolves to must be public (no loopback, private,
 *   link-local or carrier ranges), and the connection uses the address that was checked; at most
 *   3 redirects, each checked the same way; headers only (the body is never read); 6 s in all.
 */
const https = require('https');
const dns = require('dns');
const net = require('net');

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6000;

/** True for addresses a fetch from the server must never reach. */
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;   // not an address at all: refuse
}

/** A typed donate link as a URL we may fetch, or an error to show. */
function checkLinkShape(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { return { ok: false, error: 'That is not a web address.' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'The link must start with https://' };
  if (u.username || u.password) return { ok: false, error: 'The link must not carry a user name or password.' };
  if (u.port && u.port !== '443') return { ok: false, error: 'The link must use the normal web port.' };
  return { ok: true, url: u };
}

/** Does a source list (CSP frame-ancestors) let `origin` frame the page? */
function ancestorsAllow(list, origin) {
  const o = new URL(origin);
  const tokens = list.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.includes("'none'")) return false;
  return tokens.some((t) => {
    if (t === '*') return true;
    if (/^https?:$/.test(t)) return t === o.protocol || (t === 'http:' && o.protocol === 'https:');
    const m = /^(?:(https?):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?\/?$/.exec(t);
    if (!m) return false;
    if (m[1] && m[1] + ':' !== o.protocol) return false;
    return m[2] ? o.hostname.endsWith('.' + m[3]) : o.hostname === m[3];
  });
}

/** From response headers: { frames, reason }. CSP frame-ancestors wins over X-Frame-Options, as in browsers. */
function framingVerdict(headers, ourOrigin) {
  const csp = [].concat(headers['content-security-policy'] || []).join(', ');
  const fa = /(?:^|[;,])\s*frame-ancestors\s+([^;,]*)/i.exec(csp);
  if (fa) {
    return ancestorsAllow(fa[1], ourOrigin)
      ? { frames: true, reason: 'The page allows this site to show it.' }
      : { frames: false, reason: `The page only lets ${fa[1].trim() || 'no site'} show it in a window (frame-ancestors).` };
  }
  const xfo = String(headers['x-frame-options'] || '').trim().toUpperCase();
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN' || xfo.startsWith('ALLOW-FROM')) {
    return { frames: false, reason: `The page refuses to be shown inside another site's window (X-Frame-Options: ${xfo}).` };
  }
  return { frames: true, reason: 'The page sets no rule against being shown in a window.' };
}

function lookupPublic(hostname, lookup) {
  return new Promise((resolve, reject) => {
    if (net.isIP(hostname)) return isPrivateAddress(hostname) ? reject(new Error('That address is not on the public internet.')) : resolve({ address: hostname, family: net.isIP(hostname) });
    lookup(hostname, { all: true }, (err, list) => {
      if (err) return reject(new Error(`The name ${hostname} could not be found.`));
      if (!list.length || list.some((a) => isPrivateAddress(a.address))) return reject(new Error('That address is not on the public internet.'));
      resolve(list[0]);
    });
  });
}

/**
 * checkFraming(link, { ourOrigin }) → { ok:true, frames, reason, finalUrl } or { ok:false, error }.
 * `lookup` and `request` can be replaced in tests.
 */
async function checkFraming(link, { ourOrigin, lookup = dns.lookup, request = https.request, timeoutMs = TIMEOUT_MS } = {}) {
  const shape = checkLinkShape(link);
  if (!shape.ok) return shape;
  const deadline = Date.now() + timeoutMs;
  let url = shape.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      const addr = await lookupPublic(url.hostname, lookup);
      res = await new Promise((resolve, reject) => {
        const req = request({
          host: url.hostname, servername: url.hostname, port: 443, method: 'GET', path: url.pathname + url.search,
          headers: { 'User-Agent': 'Pacifica podcast studio (donate link check)', Accept: 'text/html' },
          // Connect to the address that was checked, never a fresh lookup (a name can change between the two).
          lookup: (h, o, cb) => (o && o.all ? cb(null, [addr]) : cb(null, addr.address, addr.family)),
        }, resolve);
        req.setTimeout(Math.max(1, deadline - Date.now()), () => req.destroy(new Error('The page took too long to answer.')));
        req.on('error', reject);
        req.end();
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
    res.destroy();   // headers are all we need
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      const next = checkLinkShape(new URL(res.headers.location, url).href);
      if (!next.ok) return { ok: false, error: `It redirects somewhere it cannot be checked: ${next.error}` };
      url = next.url;
      continue;
    }
    if (res.statusCode >= 400) return { ok: false, error: `The page answered with an error (HTTP ${res.statusCode}).` };
    return { ok: true, finalUrl: url.href, ...framingVerdict(res.headers, ourOrigin) };
  }
  return { ok: false, error: 'It redirects too many times.' };
}

module.exports = { checkFraming, checkLinkShape, framingVerdict, ancestorsAllow, isPrivateAddress };
