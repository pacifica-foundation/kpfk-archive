#!/usr/bin/env node
// Link-preview (Open Graph) suite for shared `?show=` links.
//
// House rule, CLAUDE.md §3a: assert the EFFECT, not the declaration. The effect
// here is what a *crawler* ends up with, so "the tag is present" is never the
// last assertion — the artwork URL in og:image is fetched, and it has to come
// back as real image bytes. A card that names an image the crawler cannot load
// shows the same blank placeholder as no card at all.
//
// No browser: iOS, Slack and Mail do not run one either. Plain HTTP is a
// higher-fidelity model of the client than Chrome would be.

const http = require('node:http');

const Search = require('../../public/archive-search');
const BASE = process.env.BASE || 'http://localhost:8080';

// fetch() silently refuses to send a custom Host — it is a forbidden header —
// so a Host-spoofing check written with it passes without ever spoofing
// anything. Section 5 needs the real thing, hence a raw request.
function rawGet(pathAndQuery, headers) {
  const u = new URL(BASE);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: u.hostname, port: u.port || 80, path: pathAndQuery, method: 'GET', headers,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, html: body }));
    });
    req.on('error', reject);
    req.end();
  });
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`   PASS  ${name}${detail ? '  → ' + detail : ''}`); }
  else { fail++; console.log(`   FAIL  ${name}${detail ? '  → ' + detail : ''}`); }
}
function section(s) { console.log('\n' + s); }

// Deliberately naive: a crawler's parser is not a DOM, and if our escaping ever
// breaks, a value that has escaped its attribute should confuse this the same
// way it would confuse them.
function meta(html, key) {
  const re = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`);
  const m = html.match(re);
  return m ? m[1] : null;
}
function unescapeAttr(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

async function getHtml(pathAndQuery, headers) {
  const res = await fetch(BASE + pathAndQuery, { headers: headers || {} });
  return { status: res.status, html: await res.text() };
}

(async function main() {
  const archive = await fetch(BASE + '/api/archive').then((r) => r.json());
  // The station card, from the running station's own config (this suite came from WBAI and
  // hard-coded "WBAI 99.5 FM Archive", so it failed on KPFK — 2026-10-14).
  const stationId = (await fetch(BASE + '/healthz').then((r) => r.json())).station;
  const stationCfg = require('../../stations/' + stationId + '.json');
  const stationCard = `${stationCfg.name} ${stationCfg.frequency} Podcasts`;
  const stationShare = (stationCfg.assets && stationCfg.assets.share) || '/assets/icon-512.png';
  const row = archive.shows.find((r) => r.photo) || archive.shows[0];
  // QIR notes, if the station runs Discovery; {} otherwise (titles then come from topics only).
  const notes = await fetch(BASE + '/api/plugins/qir/notes').then((r) => (r.ok ? r.json() : {}))
    .then((b) => b.notes || {}, () => ({}));
  if (!row) { console.log('no archive rows — is the app running on :8080?'); process.exit(1); }

  section(`1. a shared episode link carries that episode's card  (${row.id} — ${row.title})`);
  const shared = await getHtml('/?show=' + encodeURIComponent(row.id));
  ok('page still serves 200', shared.status === 200, String(shared.status));
  // The card names the episode (2026-10-14): the station's topic, else QIR's headline,
  // then " — Show"; with neither it is the show's name, as it always was.
  const expected = (r) => {
    const show = ((archive.directory || {})[r.sho] || {}).name || r.title;
    const ep = Search.episodeTitle(r) || ((notes[r.id] || {}).headline) || '';
    return ep ? ep + ' — ' + show : show;
  };
  ok('og:title names the episode (or the show when nothing names the episode)',
    unescapeAttr(meta(shared.html, 'og:title')) === expected(row),
    meta(shared.html, 'og:title') + '  expected: ' + expected(row));
  // Teeth for the station's topic: an episode the station names carries that name.
  const named = archive.shows.find((r) => Search.episodeTitle(r));
  if (named) {
    const n = await getHtml('/?show=' + encodeURIComponent(named.id));
    ok('an episode the station names carries "<topic> — <show>"',
      unescapeAttr(meta(n.html, 'og:title')) === expected(named) && expected(named) !== named.title,
      meta(n.html, 'og:title'));
  } else {
    console.log('   SKIP  station-topic title (no episode here has a short topic)');
  }
  // Teeth for the QIR path: an episode only QIR names must carry QIR's headline.
  const qirOnly = archive.shows.find((r) => !Search.episodeTitle(r) && (notes[r.id] || {}).headline);
  if (!qirOnly) {
    console.log('   SKIP  QIR-headline title (no episode here is named only by QIR — QIR off or not configured?)');
  } else {
    const q = await getHtml('/?show=' + encodeURIComponent(qirOnly.id));
    ok('an episode only QIR names carries its headline',
      unescapeAttr(meta(q.html, 'og:title')) === expected(qirOnly), meta(q.html, 'og:title'));
    let summary = notes[qirOnly.id].summary.replace(/\s+/g, ' ').trim();
    if (summary.length > 300) summary = summary.slice(0, 297).trimEnd() + '…';
    if (summary) {
      ok('…and QIR\'s summary as the description',
        unescapeAttr(meta(q.html, 'og:description')) === summary, meta(q.html, 'og:description'));
    }
  }
  const img = meta(shared.html, 'og:image');
  ok('og:image points at the show artwork, not the station icon',
    !!img && img.endsWith(row.photo), img);
  ok('og:url is the same deep link', (meta(shared.html, 'og:url') || '').endsWith('/?show=' + row.id),
    meta(shared.html, 'og:url'));
  ok('og:description is non-empty', (meta(shared.html, 'og:description') || '').length > 0);

  section('2. the artwork a crawler is pointed at actually loads');
  // The whole point. Everything above is a declaration; this is the effect.
  // Bail loudly rather than throwing: pointed at a host still serving an older
  // build (§4), "there is no og:image" is the finding, not a stack trace.
  if (!img) {
    console.log('   FAIL  no og:image to fetch — is this host running the current build?');
    console.log(`\nFAILED — ${pass} passed, ${fail + 1} failed`);
    process.exit(1);
  }
  const imgRes = await fetch(img, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  ok('og:image is an absolute URL', /^https?:\/\/[^/]+\//.test(img || ''), img);
  ok('og:image fetches 200', imgRes.status === 200, String(imgRes.status));
  ok('og:image is served as an image', /^image\//.test(imgRes.headers.get('content-type') || ''),
    imgRes.headers.get('content-type'));
  ok('og:image has real bytes, not an error page', bytes.length > 2000, bytes.length + ' bytes');
  ok('og:image is a JPEG/PNG by magic number, not by extension',
    (bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes[0] === 0x89 && bytes[1] === 0x50),
    bytes.slice(0, 2).toString('hex'));

  section('3. absolute URLs are built from the proxy, not from localhost');
  // Prod terminates TLS ahead of us; a card advertising http://internal-host is
  // one no crawler can fetch. Against a local server we play the proxy ourselves.
  // Against a deployed site the real proxy (Coolify) replaces any X-Forwarded-Host a
  // client sends — rightly, or anyone could put their own address in our cards — so
  // there the URLs must carry the site's own public address (2026-10-15: this
  // section sent a WBAI-era host and failed on podcasts.kpfk.org for that reason).
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
  const want = local ? 'https://proxy.example.org' : new URL(BASE).origin;
  const fwd = await getHtml('/?show=' + encodeURIComponent(row.id),
    local ? { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'proxy.example.org' } : {});
  ok(`og:url uses the ${local ? 'forwarded' : 'public'} scheme and host`,
    meta(fwd.html, 'og:url') === want + '/?show=' + row.id,
    meta(fwd.html, 'og:url'));
  ok(`og:image uses the ${local ? 'forwarded' : 'public'} scheme and host`,
    meta(fwd.html, 'og:image') === want + row.photo,
    meta(fwd.html, 'og:image'));

  section('4. fallbacks');
  const bare = await getHtml('/');
  ok('the bare site gets the station card',
    unescapeAttr(meta(bare.html, 'og:title')) === stationCard, meta(bare.html, 'og:title'));
  ok('the station card names the app icon',
    (meta(bare.html, 'og:image') || '').endsWith(stationShare),
    meta(bare.html, 'og:image'));
  const gone = await getHtml('/?show=000000');
  ok('an expired/unknown id falls back rather than emitting a broken card',
    unescapeAttr(meta(gone.html, 'og:title')) === stationCard, meta(gone.html, 'og:title'));

  section('5. a hostile id cannot break out of the meta attribute');
  // Assertions of absence need teeth (§3a.5): `meta()` matches up to the first
  // `"`, so an unescaped payload would land in the *value* and be caught here,
  // and a payload that escaped the tag entirely would make `meta()` return null.
  // Both failure modes are visible, not silent.
  const hostile = await getHtml('/?show=' + encodeURIComponent('1"><script>alert(1)</script>'));
  ok('no raw <script> reached the response', !/<script>alert\(1\)<\/script>/.test(hostile.html));
  ok('og:title still parses as a single attribute', meta(hostile.html, 'og:title') !== null,
    meta(hostile.html, 'og:title'));
  // rawGet() speaks plain HTTP, and against an https BASE the Host header is
  // the proxy's business anyway — say so rather than reporting a silent skip.
  if (!BASE.startsWith('http://')) {
  console.log('   SKIP  Host-header checks (plain-HTTP only; BASE is ' + BASE + ')');
  } else {
  // Teeth first: prove this probe can see a Host it *is* meant to honour,
  // otherwise "no `evil` in the page" is just a header that never got sent.
  const goodHost = await rawGet('/?show=' + encodeURIComponent(row.id), { Host: 'wbai.example' });
  ok('SELF-TEST: a well-formed Host does reach the server',
    (meta(goodHost.html, 'og:url') || '').startsWith('http://wbai.example/'),
    meta(goodHost.html, 'og:url') + '  → section 5 has teeth');
  const evilHost = await rawGet('/?show=' + encodeURIComponent(row.id), {
    Host: 'evil"><script>x</script>',
  });
  ok('a malformed Host is dropped, never interpolated',
    !/evil/.test(evilHost.html), meta(evilHost.html, 'og:url'));
  }

  section('6. the OG block did not cost us the never-stale guarantee (§1)');
  // ogTags() rewrites the same HTML stampAssets() does; one clobbering the other
  // would reintroduce the exact bug the version stamps exist to prevent.
  ok('app.js is still version-stamped', /src="\/app\.js\?v=[^"]+"/.test(shared.html));
  ok('styles.css is still version-stamped', /href="\/styles\.css\?v=[^"]+"/.test(shared.html));
  ok('theme-boot.js is still version-stamped', /src="\/theme-boot\.js\?v=[^"]+"/.test(shared.html));

  console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
