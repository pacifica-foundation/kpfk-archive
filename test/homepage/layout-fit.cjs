// Layout fit at phone widths, and archive play refusals (site audit, 2026-10-15).
// Each check is a sweep for a class of bug, not a probe of the one instance the audit found:
//  1. Squeezed text — a flex row whose text column starts at zero width (`flex:1`) lets a
//     sibling button take the line, so the text is crushed to a sliver instead of the button
//     wrapping (search result cards: show titles 24px wide at 360).
//  2. "…" that never shows — text-overflow:ellipsis inside a <button> laid out as a column
//     flex box. Buttons default to align-items:flex-start, so the line sizes to its text and
//     is clipped by the button's edge, or runs under a neighbour (player subtitle under the
//     Songs button; 21 of 111 week-grid host names cut mid-letter).
//  3. Dotted detail lines that break before a "·" or inside a part ("5:00 / am").
//  4. Touch targets under WCAG 2.2's 24px minimum (with its spacing exception) on a touch screen.
//  5. A refused play() (no recent tap, power saving) fires neither `error` nor `pause`, so the
//     spinner the click started never stopped. Every archive play path is driven with play()
//     refused; the spinner must stop and the refusal must be logged.
// Live browser check against a running app (default :8081 — use the 8091 scratch server),
// Chrome remote debugging on CDP_PORT (default 9231, dedicated temporary profile, --mute-audio).
const { connect, sleep } = require('../live-stream/cdp.js');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0; const check = (name, v, detail) => { console.log((v ? 'PASS ' : 'FAIL ') + name + (v || detail === undefined ? '' : '\n     ' + detail)); if (!v) { failed++; process.exitCode = 1; } };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(250); } return false; };
  const size = async (width, height = 844) => {
    await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
    await p.send('Emulation.setTouchEmulationEnabled', width < 800 ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await sleep(500);
  };
  // Safari (every iPhone browser) gives <button> align-items:flex-start by default; current
  // desktop Chrome no longer does, so a Chrome-only run never saw class 2. Reproduce Safari's
  // default as a lowest-specificity rule in an inspector stylesheet (the CSP does not apply to
  // it; the site's own class rules still win, as they do over a browser default).
  await p.send('DOM.enable'); await p.send('CSS.enable');
  const safariButtons = async () => {
    const { frameTree } = await p.send('Page.getFrameTree');
    const { styleSheetId } = await p.send('CSS.createStyleSheet', { frameId: frameTree.frame.id });
    await p.send('CSS.setStyleSheetText', { styleSheetId, text: 'button{align-items:flex-start}' });
  };
  const load = async (path = '/') => {
    await p.send('Page.navigate', { url: base + path });
    await until(`return document.readyState === 'complete' && document.querySelectorAll('.ja-play, #rows .play-btn').length > 0;`, 30000);
    await safariButtons();
    await sleep(800);
  };
  const label = `function label(e){ return (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]); }`;

  // 1. Text columns crushed by a sibling in a row (any flex row, any view).
  const squeezed = `${label}
    var out = [];
    document.querySelectorAll('body *').forEach(function(e){
      var cs = getComputedStyle(e);
      if(cs.display !== 'flex' || cs.flexDirection !== 'row') return;
      var pr = e.getBoundingClientRect(); if(pr.width < 250 || pr.bottom < 0) return;
      for(var i = 0; i < e.children.length; i++){
        var c = e.children[i], r = c.getBoundingClientRect(), t = (c.innerText || '').trim();
        var lh = parseFloat(getComputedStyle(c).lineHeight) || 1.3 * parseFloat(getComputedStyle(c).fontSize);
        if(t.length > 25 && r.width && r.width < pr.width * 0.3 && r.height > 3 * lh)
          out.push(label(e) + ' > ' + label(c) + ' is ' + Math.round(r.width) + 'px of ' + Math.round(pr.width) + ' "' + t.slice(0, 24).replace(/\\s+/g, ' ') + '"');
      }
    });
    return Array.from(new Set(out));`;

  // 2. Lines meant to end in "…" that are wider than their parent's content box.
  const overflowing = `${label}
    var out = [];
    document.querySelectorAll('*').forEach(function(e){
      if(getComputedStyle(e).textOverflow !== 'ellipsis') return;
      var r = e.getBoundingClientRect(); if(!r.width || r.bottom < 0) return;
      var par = e.parentElement, pr = par.getBoundingClientRect(), pcs = getComputedStyle(par);
      var right = pr.right - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderRightWidth);
      if(r.right > right + 1) out.push(label(par) + ' > ' + label(e) + ' overflows by ' + Math.round(r.right - right) + 'px "' + e.textContent.trim().slice(0, 24) + '"');
    });
    return Array.from(new Set(out));`;

  // 3. Dotted detail lines ("Public Affairs · Oct 15 · 5:00 am · 60 min") break right after a
  //    "·" or inside the first part (a title may wrap between words) — never before the dot
  //    ("· 60 min") and never inside a later part ("5:00 / am", "Oct / 14"). A rendered line
  //    starts where a character sits below the one before it.
  const dotStartsLine = `
    var out = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n;
    var range = document.createRange();
    function box(node, i){ range.setStart(node, i); range.setEnd(node, i + 1); return range.getBoundingClientRect(); }
    while((n = walker.nextNode())){
      // detail lines are short; a long description with a "\u00b7" in it wraps at its spaces as prose
      var s = n.nodeValue; if(s.indexOf('\u00b7') < 0 || s.trim().length > 80) continue;
      var el = n.parentElement; if(!el || !el.getClientRects().length) continue;
      if(getComputedStyle(el).whiteSpace.indexOf('nowrap') === 0) continue;
      var prev = null, prevIdx = -1;
      for(var i = 0; i < s.length; i++){
        if(/\s/.test(s[i])) continue;
        var r = box(n, i); if(!r.width) continue;
        // the first part may be a title, which wraps between its words; parts after a dot stay whole
        var inFirstPart = s.indexOf('\u00b7') > i;
        if(prev && r.top > prev.bottom - 2 && s[prevIdx] !== '\u00b7' && !inFirstPart)
          out.push((el.className || el.tagName) + ': breaks at "…' + s.slice(Math.max(0, prevIdx - 10), prevIdx + 1) + ' / ' + s.slice(i, i + 10) + '…"');
        prev = r; prevIdx = i;
      }
    }
    return Array.from(new Set(out));`;

  // 4. WCAG 2.2 target size (2.5.8, AA): a visible, hit-testable control at least 24x24px — or,
  //    the spacing exception, one whose 24px circle (centred on it) meets no other target and no
  //    other undersized target's circle — or one with a full-size equivalent (same action).
//    Sliders excluded: the browser sizes their touch area.
  const smallTargets = `${label}
    var targets = [];
    document.querySelectorAll('button, a[href], [role="button"], input:not([type="range"]), select').forEach(function(e){
      var r = e.getBoundingClientRect();
      if(!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return;
      var cs = getComputedStyle(e);
      if(cs.visibility === 'hidden' || cs.pointerEvents === 'none' || e.closest('[aria-hidden="true"]')) return;
      var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if(!hit || !(e === hit || e.contains(hit) || hit.contains(e))) return;
      targets.push({ e: e, r: r, cx: r.left + r.width / 2, cy: r.top + r.height / 2, small: r.width < 24 || r.height < 24 });
    });
    function circleMeetsRect(t, r){
      var dx = Math.max(r.left - t.cx, 0, t.cx - r.right), dy = Math.max(r.top - t.cy, 0, t.cy - r.bottom);
      return dx * dx + dy * dy < 12 * 12;
    }
    // The equivalent-control exception: a small target is fine when a full-size one does the
    // same thing. Same thing = the app's own rule (activateRowTarget): .more-link and .show-open
    // with the same data-id both open that show's sheet.
    var opener = '.more-link, .show-open';
    function hasEquivalent(t){
      if(!t.e.matches(opener) || !t.e.dataset.id) return false;
      return targets.some(function(o){ return o !== t && !o.small && o.e.matches(opener) && o.e.dataset.id === t.e.dataset.id; });
    }
    var out = [];
    targets.forEach(function(t){
      if(!t.small || hasEquivalent(t)) return;
      var crowded = targets.filter(function(o){
        if(o === t || o.e.contains(t.e) || t.e.contains(o.e)) return false;
        return circleMeetsRect(t, o.r) || (o.small && Math.hypot(o.cx - t.cx, o.cy - t.cy) < 24);
      });
      if(crowded.length) out.push(label(t.e) + ' ' + Math.round(t.r.width) + 'x' + Math.round(t.r.height) + ' (crowds ' + label(crowded[0].e) + ')');
    });
    return Array.from(new Set(out));`;

  const sweep = async (name, js) => { const found = await p.eval(js); check(name, found.length === 0, found.slice(0, 8).join('\n     ')); return found; };

  // ---- phone widths: home, search, Episodes tab, a show sheet, playing ----
  for (const w of [360, 390]) {
    await size(w);
    await load('/?q=news');
    await until(`return document.querySelectorAll('#searchResults .search-show').length > 0;`, 8000);
    const seen = await p.eval(`return document.querySelectorAll('#searchResults .search-show').length;`);
    check(`${w}px: the search sweep has show cards to measure`, seen > 0, `${seen} cards`);
    await sweep(`${w}px search: no text column crushed by a button`, squeezed);
    await sweep(`${w}px search: no "…" line wider than its box`, overflowing);
    await sweep(`${w}px search: dotted lines break only between parts`, dotStartsLine);
    check(`${w}px: the clear button is showing to measure`, await p.eval(`return !document.getElementById('qClear').hidden;`));
    await sweep(`${w}px search, with its clear button: touch targets at least 24px`, smallTargets);

    await load('/');
    await sweep(`${w}px home: no text column crushed`, squeezed);
    await sweep(`${w}px home: dotted lines break only between parts`, dotStartsLine);
    await sweep(`${w}px home: touch targets at least 24px`, smallTargets);
    await p.click('.browse-tab[data-browse="episodes"]'); await sleep(700);
    await sweep(`${w}px Episodes tab: dotted lines break only between parts`, dotStartsLine);
    await sweep(`${w}px Episodes tab: touch targets at least 24px`, smallTargets);
    await p.click('.browse-tab[data-browse="all"]'); await sleep(600);

    await p.click('.ja-play'); await until(`return !document.getElementById('playerBar').hidden;`, 6000); await sleep(1200);
    const sub = await p.eval(`return document.getElementById('playerSub').textContent;`);
    check(`${w}px: Safari's button default is reproduced`, await p.eval(`var b = document.createElement('button'); document.body.appendChild(b); var v = getComputedStyle(b).alignItems; b.remove(); return v === 'flex-start';`));
    check(`${w}px: the player has a subtitle to measure`, sub.length > 10, JSON.stringify(sub));
    await sweep(`${w}px playing: no "…" line wider than its box (player subtitle)`, overflowing);
    await p.eval(`document.getElementById('mainAudio').pause(); return 1;`);

    await p.click('#rows .card-wrap .show-open, #rows .card-meta');
    await until(`return document.getElementById('showSheet').classList.contains('show');`, 4000); await sleep(900);
    await sweep(`${w}px sheet: dotted lines break only between parts`, dotStartsLine);
    await sweep(`${w}px sheet: no "…" line wider than its box`, overflowing);
    await sweep(`${w}px sheet: touch targets at least 24px`, smallTargets);
  }

  // ---- desktop: the week grid (1024px and up only) ----
  await size(1280, 900);
  await load('/');
  await p.click('#scheduleBtn'); await until(`return document.getElementById('schedModal').classList.contains('show') || !!document.querySelector('#schedTabs button');`, 6000); await sleep(800);
  await p.click('#schedGridBtn'); await until(`return document.querySelectorAll('#gridBody .grid-host').length > 20;`, 8000); await sleep(600);
  const hosts = await p.eval(`return Array.from(document.querySelectorAll('#gridBody .grid-host')).filter(function(h){ return h.offsetWidth; }).length;`);
  check('grid: host lines to measure', hosts > 20, `${hosts}`);
  await sweep('grid: no host or time line wider than its block', overflowing);

  // ---- 5. archive play refused: every entry point stops its spinner and logs ----
  await size(390);
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__ms = {}; window.__warned = [];
    if (navigator.mediaSession) { var set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = function(a, fn){ window.__ms[a] = fn; return set(a, fn); }; }
    var warn = console.warn; console.warn = function(){ window.__warned.push(Array.from(arguments).join(' ')); return warn.apply(console, arguments); };` });
  await load('/');
  const refuse = `var a = document.getElementById('mainAudio'); a.pause(); window.__warned = [];
    a.play = function(){ return Promise.reject(new DOMException('refused by test', 'NotAllowedError')); }; return 1;`;
  const allow = `delete document.getElementById('mainAudio').play; return 1;`;
  const spinning = `return document.querySelectorAll('.loading').length;`;
  const afterRefusal = async name => {
    await sleep(900);
    const st = await p.eval(`return { spin: document.querySelectorAll('.loading').length, warned: window.__warned.slice(), status: document.getElementById('playerStatus').textContent };`);
    check(`${name}: the spinner stops`, st.spin === 0, JSON.stringify(st));
    check(`${name}: the refusal is logged`, st.warned.some(m => /refused|NotAllowed/i.test(m)), JSON.stringify(st.warned));
    check(`${name}: the player says what to do`, /tap play/i.test(st.status), JSON.stringify(st.status));
  };
  // The probe must be able to see a spinner: a pending play shows one.
  await p.eval(`document.getElementById('mainAudio').play = function(){ return new Promise(function(){}); }; return 1;`);
  await p.click('.ja-play'); await sleep(500);
  check('the probe can see a spinner (play pending)', (await p.eval(spinning)) > 0);
  await p.eval(allow); await p.eval(`document.getElementById('mainAudio').pause(); return 1;`);

  await load('/');
  await p.eval(refuse);
  await p.click('.ja-play');
  await afterRefusal('fresh play from Just aired');

  await p.eval(allow); await p.click('#playerToggle'); await until(`return !document.getElementById('mainAudio').paused;`, 8000);
  await p.eval(refuse);
  await sleep(500);   // let the pause's own `pause` event land first, as it would for a person
  await p.click('#playerToggle');
  await afterRefusal('resume from the player bar');

  await p.eval(refuse);
  const hasHandler = await p.eval(`return typeof window.__ms.play === 'function';`);
  check('the lock-screen play handler is registered', hasHandler);
  if (hasHandler) { await p.eval(`window.__ms.play(); return 1;`); await afterRefusal('lock-screen play'); }

  console.log(failed ? `\n${failed} failure(s)` : '\nOK — layout fit and play refusal checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
