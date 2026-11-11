/* Studio: the Embeds tab (2026-11-11, docs/kpfk/podcast-embed-plan.md). Code for other websites.
 *   1. Podcast player: pick the settings, see the real player in a frame at desktop, tablet or
 *      phone width, copy the code. The link is written by public/podcast-embed-options.js, the
 *      same file the player reads, so the two always agree.
 *   2. Fund drive capsule: its code (moved here from the Fund drive card). One style and colour
 *      choice sets the preview, the code and Open together.
 * Nothing here is saved or changes the site: the tab only writes code to paste elsewhere.
 * Colours are set through CSSOM (el.style.x = ...): the page's policy voids inline style="". */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PE = window.PodcastEmbed, panel = $('embedsPanel');
  if (!panel) return;
  if (!PE) { console.error('[studio] Embeds: /podcast-embed-options.js did not load'); return; }
  var cfg = window.StationConfig || {};
  // The address in the code: the station's public address (profile siteUrl), so code copied from a
  // laptop or a staging app still points at the real site. This address until the server answers.
  var site = location.origin;

  function say(node, text, kind) { node.textContent = text; node.className = 'export-status' + (kind ? ' is-' + kind : ''); }
  function pressed(selector, attr, value) {
    panel.querySelectorAll(selector).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset[attr] === value)); });
  }
  function copyFrom(pre, status) {
    var text = pre.textContent;
    // The clipboard can be refused (no https, a browser setting): say so instead of pretending.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { say(status, 'Copied.', 'ok'); }, function (e) {
        console.warn('[studio] copy refused:', e && e.message);
        say(status, 'Copy was refused by the browser: select the code above and copy it.', 'bad');
      });
    } else say(status, 'Select the code above and copy it.');
  }
  function clamp(raw, min, max, fallback) {
    var n = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
  }

  // ================= 1. Podcast player =================
  var DEVICES = { desktop: null, tablet: 768, phone: 375 };
  var opts, width, unit, height, device = 'desktop', previewTimer = null, shownPath = null;
  var showSel = $('emShow'), sortSel = $('emSort'), limitSel = $('emLimit'), orderSel = $('emOrder');
  var heading = $('emHeading'), darkPick = $('emDarkPick'), darkHex = $('emDarkHex'), lightPick = $('emLightPick'), lightHex = $('emLightHex');
  var widthIn = $('emWidth'), unitSel = $('emUnit'), heightIn = $('emHeight');
  var frame = $('emFrame'), stage = $('emStage');

  PE.EPISODE_LIMITS.forEach(function (n) {
    var o = document.createElement('option');
    o.value = String(n); o.textContent = 'Latest ' + n;
    limitSel.appendChild(o);
  });
  heading.maxLength = PE.TITLE_MAX;

  // Colour presets: one click sets both themes. Left half the dark theme's shade, right the light's.
  var presetButtons = PE.ACCENT_PRESETS.map(function (p, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'em-chip';
    b.title = p.name + ': ' + p.dark + ' dark, ' + p.light + ' light';
    var swatch = document.createElement('span'), a = document.createElement('span'), c = document.createElement('span');
    swatch.className = 'em-swatch'; swatch.setAttribute('aria-hidden', 'true');
    a.style.background = p.dark; c.style.background = p.light;
    swatch.appendChild(a); swatch.appendChild(c);
    b.appendChild(swatch);
    b.appendChild(document.createTextNode(p.name + (i === 0 ? ' (default)' : '')));
    b.addEventListener('click', function () { opts.darkColor = p.dark; opts.lightColor = p.light; paint(); });
    $('emPresets').appendChild(b);
    return b;
  });

  function reset() {
    opts = {};
    Object.keys(PE.DEFAULT_OPTIONS).forEach(function (k) { opts[k] = PE.DEFAULT_OPTIONS[k]; });
    width = '100'; unit = '%'; height = '600';
  }
  function sizes() {
    return {
      height: clamp(height, 300, 1600, 600),
      width: unit === '%' ? clamp(width, 10, 100, 100) + '%' : String(clamp(width, 250, 2000, 600))
    };
  }
  function playerPath() { var q = PE.embedQuery(opts); return '/embed/podcasts' + (q ? '?' + q : ''); }

  function paint() {
    // the controls
    showSel.value = opts.show || '';
    sortSel.value = opts.sort;
    limitSel.value = opts.limit === null ? '' : String(opts.limit);
    orderSel.value = opts.order;
    orderSel.disabled = !opts.selector;
    pressed('[data-em-theme]', 'emTheme', opts.theme);
    panel.querySelectorAll('[data-em-switch]').forEach(function (b) {
      var k = b.dataset.emSwitch;
      b.setAttribute('aria-checked', String(opts[k]));
      b.disabled = (k === 'headerIcon' || k === 'themeToggle') && !opts.header;
    });
    if (document.activeElement !== heading) heading.value = opts.title || '';
    heading.disabled = !opts.header;
    presetButtons.forEach(function (b, i) {
      var p = PE.ACCENT_PRESETS[i];
      b.setAttribute('aria-pressed', String(opts.darkColor === p.dark && opts.lightColor === p.light));
    });
    darkPick.value = opts.darkColor; lightPick.value = opts.lightColor;
    if (document.activeElement !== darkHex) darkHex.value = opts.darkColor;
    if (document.activeElement !== lightHex) lightHex.value = opts.lightColor;
    if (document.activeElement !== widthIn) widthIn.value = width;
    if (document.activeElement !== heightIn) heightIn.value = height;
    unitSel.value = unit;
    pressed('[data-em-device]', 'emDevice', device);

    // the code, and the preview's box
    var size = sizes(), path = playerPath();
    $('emSnippet').textContent = PE.iframeCode(site + path, size.width, String(size.height), (opts.title || cfg.name || 'Station') + ' podcast player');
    $('emOpen').href = path;
    var fixed = DEVICES[device];
    stage.style.width = fixed ? fixed + 'px' : (unit === '%' ? size.width : size.width + 'px');
    stage.classList.toggle('is-fixed', !!fixed);
    frame.style.height = size.height + 'px';
    $('emDeviceNote').textContent = fixed ? fixed + 'px wide' : '';

    // the preview: typing a title would reload it on every key, so wait for a pause
    if (path === shownPath || panel.hidden) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      if (panel.hidden) return;
      shownPath = path;
      frame.src = path;
    }, shownPath === null ? 0 : 400);
  }

  showSel.addEventListener('change', function () { opts.show = showSel.value || null; paint(); });
  sortSel.addEventListener('change', function () { opts.sort = sortSel.value; paint(); });
  limitSel.addEventListener('change', function () { opts.limit = limitSel.value ? Number(limitSel.value) : null; paint(); });
  orderSel.addEventListener('change', function () { opts.order = orderSel.value; paint(); });
  panel.querySelectorAll('[data-em-theme]').forEach(function (b) { b.addEventListener('click', function () { opts.theme = b.dataset.emTheme; paint(); }); });
  panel.querySelectorAll('[data-em-switch]').forEach(function (b) {
    b.addEventListener('click', function () { var k = b.dataset.emSwitch; opts[k] = !opts[k]; paint(); });
  });
  heading.addEventListener('input', function () { opts.title = heading.value.trim() ? heading.value : null; paint(); });
  heading.addEventListener('blur', paint);
  [[darkPick, darkHex, 'darkColor'], [lightPick, lightHex, 'lightColor']].forEach(function (c) {
    c[0].addEventListener('input', function () { opts[c[2]] = c[0].value; paint(); });
    // A half-typed colour changes nothing; leaving the box puts the colour in use back.
    c[1].addEventListener('input', function () { var hex = PE.normalizeHex(c[1].value); if (hex) { opts[c[2]] = hex; paint(); } });
    c[1].addEventListener('blur', paint);
  });
  widthIn.addEventListener('input', function () { width = widthIn.value; paint(); });
  heightIn.addEventListener('input', function () { height = heightIn.value; paint(); });
  [widthIn, heightIn].forEach(function (i) { i.addEventListener('blur', paint); });
  unitSel.addEventListener('change', function () { unit = unitSel.value; width = unit === '%' ? '100' : '600'; paint(); });
  panel.querySelectorAll('[data-em-device]').forEach(function (b) { b.addEventListener('click', function () { device = b.dataset.emDevice; paint(); }); });
  $('emReset').addEventListener('click', function () { reset(); say($('emCopyStatus'), ''); paint(); });
  $('emCopy').addEventListener('click', function () { copyFrom($('emSnippet'), $('emCopyStatus')); });

  // The starting-show list: the same shows the player offers, from the site's own feed.
  var showsLoaded = false;
  function loadShows() {
    if (showsLoaded) return;
    showsLoaded = true;
    fetch('/api/archive', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (archive) {
        PE.orderShows(PE.showsFromArchive(archive), 'alphabetical').forEach(function (s) {
          var o = document.createElement('option');
          o.value = s.key; o.textContent = s.title + ' (' + s.episodeCount + ')';
          showSel.appendChild(o);
        });
        showSel.value = opts.show || '';
      })
      .catch(function (e) {
        // The rest of the tab works without the list; say why it is short and let the next visit retry.
        showsLoaded = false;
        console.warn('[studio] Embeds: show list unavailable:', e.message);
        say($('emCopyStatus'), 'The list of shows could not be loaded; the player starts on the first show.', 'bad');
      });
  }

  // ================= 2. Fund drive capsule =================
  var FD_HEIGHT = { classic: 170, slim: 120, ring: 340 };
  var fdStyle = 'classic', fdTheme = 'light', fdShown = null;
  function paintFund() {
    pressed('[data-fde-style]', 'fdeStyle', fdStyle);
    pressed('[data-fde-theme]', 'fdeTheme', fdTheme);
    var path = '/embed/fund-drive?theme=' + fdTheme + '&style=' + fdStyle;
    $('fdSnippet').textContent = '<iframe src="' + site + path + '" title="Fund drive" style="width:100%;height:' + FD_HEIGHT[fdStyle] + 'px;border:0" loading="lazy"></iframe>';
    $('fdOpenEmbed').href = path;
    var fdFrame = $('fdeFrame');
    fdFrame.style.height = FD_HEIGHT[fdStyle] + 'px';
    if (path === fdShown || panel.hidden) return;
    fdShown = path;
    fdFrame.src = path;
  }
  panel.querySelectorAll('[data-fde-style]').forEach(function (b) { b.addEventListener('click', function () { fdStyle = b.dataset.fdeStyle; paintFund(); }); });
  panel.querySelectorAll('[data-fde-theme]').forEach(function (b) { b.addEventListener('click', function () { fdTheme = b.dataset.fdeTheme; paintFund(); }); });
  $('fdCopy').addEventListener('click', function () { copyFrom($('fdSnippet'), $('fdCopyStatus')); });

  // Is the drive on? The capsule draws nothing while it is off, so an empty preview needs a reason.
  var styleFromSite = false;
  function loadFundState() {
    fetch('/api/fund-drive', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) {
        say($('fdeState'), f.on ? 'The fund drive is on: the capsule is showing.' : 'The fund drive is off: the capsule shows nothing until it is switched on, so the preview is empty.');
        // Start from the style in use on Listen Live, once; after that the choice here stands.
        if (!styleFromSite && FD_HEIGHT[f.style]) { styleFromSite = true; fdStyle = f.style; paintFund(); }
        // A drive switched on or off since the preview loaded: draw it again.
        else if ($('fdeFrame').src) { fdShown = null; paintFund(); }
      })
      .catch(function (e) { console.warn('[studio] Embeds: fund drive state unavailable:', e.message); say($('fdeState'), ''); });
  }

  // ================= opening the tab =================
  var siteAsked = false;
  function opened() {
    loadShows();
    loadFundState();
    paint();
    paintFund();
    if (siteAsked) return;
    siteAsked = true;
    fetch('/api/studio/embeds', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (s) { if (s.siteUrl) { site = s.siteUrl; paint(); paintFund(); } })
      .catch(function (e) { siteAsked = false; console.warn('[studio] Embeds: site address unavailable, using this one:', e.message); });
  }
  document.addEventListener('studio:tab', function (e) { if (e.detail === 'embeds') opened(); });

  reset();
  paint();
  paintFund();
  if (!panel.hidden) opened();
})();
