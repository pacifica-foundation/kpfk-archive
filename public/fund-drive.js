/* Donation capsule (fund drive, Phase 4a — Paul, 2026-10-27). One drawing for every place it
 * shows: Listen Live (app.js), the embed page other sites frame (/embed/fund-drive), and the
 * studio's preview. Figures come from /api/fund-drive (set in the studio, lib/fund-drive.js);
 * switched off, the capsule is hidden. Nothing here is about the listener.
 *
 *   FundDrive.build(el, { onDonate, donateHref, newTab, banner, style })  → { paint(figures) }
 *   Three looks (Paul, 2026-10-29), one drawing laid out by styles.css on data-style: classic (the
 *   card), slim (one line, for a site header or footer), ring (a progress ring card, for a sidebar).
 *   The figures' style is the studio's choice; opts.style (the embed's ?style=) overrides it.
 *   Donate goes to the figures' donateUrl when the studio set one (a pledge page for the drive,
 *   Paul 2026-10-28), else donateHref; onDonate(url) gets that address.
 *   `banner` (optional): an <a> for the fund drive banner (Paul, 2026-10-27: the approved design's
 *   red "FALL FUND DRIVE · Donate now" strip on top of Listen Live). Same switch as the capsule.
 *   FundDrive.mount(el, { ...build options, active, poll }) → { refresh(), stop() }
 */
(function () {
  'use strict';
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function fmt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  var STYLES = ['classic', 'slim', 'ring'], SVG = 'http://www.w3.org/2000/svg', R = 44, C = 2 * Math.PI * R;
  function svg(tag, attrs) { var n = document.createElementNS(SVG, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  function build(root, opts) {
    opts = opts || {};
    root.classList.add('fd-cap');
    root.textContent = '';
    var top = el('div', 'fd-top'), eyebrow = el('span', 'fd-eyebrow'), dot = el('i'), name = el('span'), pct = el('span', 'fd-pct');
    dot.setAttribute('aria-hidden', 'true');
    eyebrow.appendChild(dot); eyebrow.appendChild(name); top.appendChild(eyebrow); top.appendChild(pct);
    var bar = el('div', 'fd-bar'), fill = el('div', 'fd-fill');
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.appendChild(fill);
    var foot = el('div', 'fd-foot'), amt = el('div', 'fd-amt', '$0'), of = el('div', 'fd-of');
    foot.appendChild(amt); foot.appendChild(of);
    var btn = el('a', 'fd-btn', 'Donate now'), href = opts.donateHref || '';
    btn.href = href || '#';
    if (opts.newTab) { btn.target = '_blank'; btn.rel = 'noopener'; }
    if (opts.onDonate) btn.addEventListener('click', function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); opts.onDonate(href);
    });
    if (!opts.donateHref && !opts.onDonate) btn.hidden = true;
    var banner = opts.banner || null;
    if (banner) {
      banner.href = opts.donateHref || '#';
      if (opts.newTab) { banner.target = '_blank'; banner.rel = 'noopener'; }
      if (opts.onDonate) banner.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault(); opts.onDonate(href);
      });
      banner.hidden = true;
    }
    // The layout lives on an inner box so it can follow the slot's width (a container query on
    // .fd-cap), not the screen's: the studio's Phone preview and a narrow column stack it too.
    var inner = el('div', 'fd-in');
    // The ring (ring style only; styles.css hides it otherwise). Presentation attributes, not style="",
    // which the CSP would void.
    var ring = el('div', 'fd-ring'), ringSvg = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
    var ringArc = svg('circle', { cx: 50, cy: 50, r: R, 'class': 'fd-ring-arc', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': C.toFixed(2), transform: 'rotate(-90 50 50)' });
    ringSvg.appendChild(svg('circle', { cx: 50, cy: 50, r: R, 'class': 'fd-ring-track' }));
    ringSvg.appendChild(ringArc);
    var ringPct = el('span', 'fd-ring-pct');
    ring.appendChild(ringSvg); ring.appendChild(ringPct);
    [ring, top, bar, foot, btn].forEach(function (n) { inner.appendChild(n); });
    root.appendChild(inner);

    var shown = null, raf = 0;
    function countTo(to) {
      cancelAnimationFrame(raf);
      var from = shown === null ? to : shown;
      shown = to;
      if (reduce.matches || from === to) { amt.textContent = fmt(to); return; }
      var t0 = performance.now(), d = 900;
      (function step(t) {
        var k = Math.min(1, (t - t0) / d); k = 1 - Math.pow(1 - k, 3);
        amt.textContent = fmt(from + (to - from) * k);
        if (k < 1) raf = requestAnimationFrame(step);
      })(t0);
    }
    function paint(f) {
      var on = !!(f && f.on && f.goal > 0);
      root.hidden = !on;
      href = (f && f.donateUrl) || opts.donateHref || '';
      btn.href = href || '#';
      btn.hidden = !href && !opts.onDonate;   // no address anywhere: a capsule without the button
      if (banner) {
        banner.href = href || '#';
        banner.hidden = !on;
        if (on) banner.textContent = (f.name || 'Fund drive') + ' · Donate now';
      }
      var style = STYLES.indexOf(opts.style) >= 0 ? opts.style : (f && STYLES.indexOf(f.style) >= 0 ? f.style : 'classic');
      root.setAttribute('data-style', style);
      if (!on) return;
      var goal = f.goal, pledged = f.pledged, done = pledged >= goal, p = Math.floor(pledged / goal * 100);
      root.classList.toggle('is-done', done);
      name.textContent = done ? 'Goal reached — thank you!' : (f.name || 'Fund drive');
      pct.textContent = p + '%';
      fill.style.width = Math.min(100, p) + '%';
      ringArc.setAttribute('stroke-dashoffset', (C * (1 - Math.min(100, p) / 100)).toFixed(2));
      ringPct.textContent = p + '%';
      bar.setAttribute('aria-valuemax', String(goal));
      bar.setAttribute('aria-valuenow', String(pledged));
      bar.setAttribute('aria-label', fmt(pledged) + ' pledged of a ' + fmt(goal) + ' goal');
      of.textContent = '';
      of.appendChild(document.createTextNode(done ? 'pledged · the goal was ' : 'pledged of a '));
      of.appendChild(el('b', '', fmt(goal)));
      if (!done) of.appendChild(document.createTextNode(' goal'));
      countTo(pledged);
    }
    root.hidden = true;
    return { paint: paint };
  }

  function mount(root, opts) {
    opts = opts || {};
    var cap = build(root, opts), timer = null, inflight = false;
    function refresh() {
      if (inflight || (opts.active && !opts.active())) return;
      inflight = true;
      fetch('/api/fund-drive', { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(cap.paint)
        // A failed refresh keeps the last figures on screen (or none); it is logged, not hidden.
        .catch(function (e) { console.warn('[fund drive] figures unavailable:', e.message); })
        .then(function () { inflight = false; });
    }
    refresh();
    timer = setInterval(refresh, opts.poll || 60000);
    return { refresh: refresh, stop: function () { clearInterval(timer); } };
  }

  window.FundDrive = { build: build, mount: mount };
})();
