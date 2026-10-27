/* Donation capsule (fund drive, Phase 4a — Paul, 2026-10-27). One drawing for every place it
 * shows: Listen Live (app.js), the embed page other sites frame (/embed/fund-drive), and the
 * studio's preview. Figures come from /api/fund-drive (set in the studio, lib/fund-drive.js);
 * switched off, the capsule is hidden. Nothing here is about the listener.
 *
 *   FundDrive.build(el, { onDonate, donateHref, newTab })  → { paint(figures) }
 *   FundDrive.mount(el, { ...build options, active, poll }) → { refresh(), stop() }
 */
(function () {
  'use strict';
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function fmt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
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
    var btn = el('a', 'fd-btn', 'Donate now');
    btn.href = opts.donateHref || '#';
    if (opts.newTab) { btn.target = '_blank'; btn.rel = 'noopener'; }
    if (opts.onDonate) btn.addEventListener('click', function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); opts.onDonate();
    });
    if (!opts.donateHref && !opts.onDonate) btn.hidden = true;
    [top, bar, foot, btn].forEach(function (n) { root.appendChild(n); });

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
      if (!on) return;
      var goal = f.goal, pledged = f.pledged, done = pledged >= goal, p = Math.floor(pledged / goal * 100);
      root.classList.toggle('is-done', done);
      name.textContent = done ? 'Goal reached — thank you!' : (f.name || 'Fund drive');
      pct.textContent = p + '%';
      fill.style.width = Math.min(100, p) + '%';
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
