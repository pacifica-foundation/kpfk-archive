/* Studio: Fund drive (Phase 4a, Paul 2026-10-27). The donation capsule: on/off, an optional
 * name, the goal and the amount pledged.
 *   The switch acts at once, after an in-app confirm box (Paul, 2026-10-28: a switch that waited for
 *   Publish was confusing). Switching on needs a goal and sends the figures in the boxes with it.
 *   The figures are a draft until Update figures (they can be saved while the drive is off).
 *   The preview is the real capsule (public/fund-drive.js) drawn from the draft, Light or Dark,
 *   Phone or Wide. Undo puts back the version before the last change, after a confirm.
 * The server checks every edit (lib/fund-drive.js). Anyone signed in to the studio may edit. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var section = $('fundSection'), tabs = $('studioTabs');
  if (!section || !tabs || !window.FundDrive) return;
  var on = $('fdOn'), nameIn = $('fdName'), goalIn = $('fdGoal'), pledgedIn = $('fdPledged'), linkIn = $('fdLink'), linkNote = $('fdLinkCheck');
  var publish = $('fdPublish'), discard = $('fdDiscard'), undo = $('fdUndo'), status = $('fdStatus');
  // The preview shows the banner too (on top of Listen Live while the drive is on); its links go nowhere here.
  var preview = window.FundDrive.build($('fdPreview'), { donateHref: '#', banner: $('fdPreviewBanner') });
  [$('fdPreview').querySelector('.fd-btn'), $('fdPreviewBanner')].forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); }); });
  var published = null, lastHistory = [], csrf = null, busy = false, embedUrl = location.origin + '/embed/fund-drive', theme = 'light';
  // The chosen look (classic | slim | ring): part of the draft, saved with Update figures.
  var style = 'classic';
  var STYLE_NAMES = { classic: 'Classic card', slim: 'Slim bar', ring: 'Ring' };
  // Under the cards: is the picked style the one listeners see, or still a draft?
  function styleNote() {
    if (!published) return '';
    if (style === published.style) return STYLE_NAMES[style] + (published.on ? ' is showing on Listen Live.' : ' is saved; it shows when the fund drive is on.');
    return STYLE_NAMES[style] + ' is not saved yet: press Update figures to use it (now: ' + STYLE_NAMES[published.style] + ').';
  }
  var EMBED_H = { classic: 170, slim: 120, ring: 340 };
  document.querySelectorAll('button[data-fd-style]').forEach(function (b) {
    b.addEventListener('click', function () { style = b.dataset.fdStyle; paintTheme(); paintDraft(); });
  });
  // Phone or Wide: the capsule follows its own width (styles.css container query), so the narrow
  // box shows the real phone layout.
  document.querySelectorAll('button[data-fd-size]').forEach(function (b) {
    b.addEventListener('click', function () {
      $('fdPreviewBox').setAttribute('data-fd-size', b.dataset.fdSize);
      document.querySelectorAll('button[data-fd-size]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    });
  });
  // One colour choice for the preview, the snippet's ?theme= and Open the embed, so all three match.
  function paintTheme() {
    $('fdPreviewBox').setAttribute('data-theme-scope', theme);
    document.querySelectorAll('[data-fd-theme]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.fdTheme === theme ? 'true' : 'false'); });
    document.querySelectorAll('button[data-fd-style]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.fdStyle === style ? 'true' : 'false'); });
    $('fdStyleNote').textContent = styleNote();
    $('fdStyleNote').className = 'fd-style-note' + (published && style !== published.style ? ' is-draft' : '');
    $('fdSnippet').textContent = '<iframe src="' + embedUrl + '?theme=' + theme + '&style=' + style + '" title="Fund drive" style="width:100%;height:' + EMBED_H[style] + 'px;border:0" loading="lazy"></iframe>';
    $('fdOpenEmbed').href = '/embed/fund-drive?theme=' + theme + '&style=' + style;
  }
  document.querySelectorAll('[data-fd-theme]').forEach(function (b) {
    b.addEventListener('click', function () { theme = b.dataset.fdTheme; paintTheme(); });
  });

  function say(node, text, kind) { node.textContent = text; node.className = 'export-status' + (kind ? ' is-' + kind : ''); }
  function digits(v) { var s = String(v).replace(/[^0-9]/g, ''); return s === '' ? null : parseInt(s, 10); }
  function money(n) { return n === null || n === undefined ? '' : Number(n).toLocaleString('en-US'); }
  function withCsrf() {
    if (csrf) return Promise.resolve(csrf);
    return fetch('/api/studio/health', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { csrf = d.csrf; return csrf; });
  }
  // The figures in the boxes. On/off is not part of the draft: the switch shows what is published.
  function draft() {
    return { name: nameIn.value.replace(/\s+/g, ' ').trim(), goal: digits(goalIn.value), pledged: digits(pledgedIn.value), donateUrl: linkIn.value.trim(), style: style };
  }
  function same(a, b) { return a.name === b.name && a.goal === b.goal && a.pledged === b.pledged && a.donateUrl === b.donateUrl && a.style === b.style; }
  // What the server sends: the figures plus the donate link, ready to post.
  function body(isOn, v) { return { on: isOn, name: v.name, goal: v.goal || 0, pledged: v.pledged || 0, donateUrl: v.donateUrl || '', style: v.style || 'classic' }; }
  // The donate link's check (lib/frame-check.js on the server): will it show inside the Donate
  // window over Listen Live? Advice only; it never blocks a save. lastCheck remembers the answer
  // so switching on can warn about a page that will not show.
  var lastCheck = { url: '', frames: true };
  function checkLink() {
    var url = linkIn.value.trim();
    if (url === lastCheck.url && linkNote.textContent) return;
    lastCheck = { url: url, frames: true };
    if (!url) { say(linkNote, ''); linkNote.className = 'fd-link-check'; return; }
    linkNote.className = 'fd-link-check'; linkNote.textContent = 'Checking the page…';
    withCsrf()
      .then(function (token) {
        return fetch('/api/studio/fund-drive/check-link', { method: 'POST', body: JSON.stringify({ url: url }),
          headers: { 'Content-Type': 'application/json', 'X-Studio-CSRF': token } });
      })
      .then(function (r) { if (r.status === 403) csrf = null; return r.json(); })
      .then(function (d) {
        if (linkIn.value.trim() !== url) return;   // typed on since: that check is stale
        if (!d.ok) { linkNote.className = 'fd-link-check is-bad'; linkNote.textContent = 'Could not check it: ' + (d.error || 'no answer') + ' Listeners may see an empty Donate window.'; lastCheck.frames = false; return; }
        lastCheck.frames = !!d.frames;
        linkNote.className = 'fd-link-check ' + (d.frames ? 'is-ok' : 'is-bad');
        linkNote.textContent = d.frames ? 'Opens inside the Donate window over Listen Live.' : 'Will not open inside the Donate window: ' + d.reason + ' Listeners would see an empty window.';
      })
      .catch(function (e) { linkNote.className = 'fd-link-check is-bad'; linkNote.textContent = 'Could not check it: ' + e.message; });
  }
  function summary(v) {
    return (v.name || 'Fund drive') + ': $' + money(v.pledged || 0) + ' of a $' + money(v.goal || 0) + ' goal';
  }
  // The preview always shows a capsule (Paul, 2026-10-27: an empty preview until you type was
  // confusing): example figures until a goal is typed, then the draft. The tag says which.
  var EXAMPLE = { on: true, name: 'Fall Fund Drive', goal: 75000, pledged: 42350 };
  function paintDraft() {
    var d = draft();
    var isOn = !!published && published.on;
    var changed = !!published && !same(d, published);
    var tag, note;
    on.setAttribute('aria-checked', isOn ? 'true' : 'false');
    if (!d.goal) {
      preview.paint(Object.assign({}, EXAMPLE, { style: style }));
      tag = 'Example'; note = 'Example figures. Type a goal and the amount pledged to see yours.';
    } else {
      preview.paint({ on: true, name: d.name, goal: d.goal, pledged: d.pledged || 0, style: style });
      if (changed) { tag = 'Draft'; note = isOn ? 'Not shown yet: Update figures to show these on Listen Live.' : 'The fund drive is off. Update figures saves these for later.'; }
      else if (isOn) { tag = 'Live'; note = 'Showing on Listen Live now.'; }
      else { tag = 'Off'; note = 'Not shown. Switch it on to show it on Listen Live.'; }
    }
    $('fdPreviewTag').textContent = tag;
    $('fdPreviewNote').textContent = note;
    publish.disabled = busy || !changed;
    on.disabled = busy;
    discard.hidden = !changed;
  }
  function fill(state) {
    var c = state.current;
    // Never set up: empty fields (null), so an untouched form is not a change to save.
    published = { on: !!c.on, name: c.name || '', goal: c.goal || null, pledged: c.updatedAt ? (c.pledged || 0) : null };
    published.donateUrl = c.donateUrl || '';
    published.style = c.style || 'classic';
    style = published.style;
    nameIn.value = c.name || '';
    linkIn.value = published.donateUrl;
    linkIn.placeholder = state.donate || 'https://';
    checkLink();
    goalIn.value = money(published.goal);
    pledgedIn.value = money(published.pledged);
    lastHistory = state.history || [];
    undo.hidden = !lastHistory.length;
    embedUrl = state.embedUrl || (location.origin + '/embed/fund-drive');
    paintTheme();
    say(status, c.updatedAt ? (c.on ? 'On' : 'Off') + ' · last changed ' + new Date(c.updatedAt).toLocaleString() : 'Not set up yet.');
    if (state.bootError) say(status, 'The saved figures could not be used (' + state.bootError + '). Enter new ones.', 'bad');
    paintDraft();
  }
  function load() {
    return fetch('/api/studio/fund-drive', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (state) {
        tabs.querySelector('[data-studio-tab="discovery"]').hidden = false;
        section.hidden = false;
        fill(state);
      })
      .catch(function (e) { console.warn('[studio] fund drive unavailable:', e.message); });
  }
  function post(path, body, okText) {
    busy = true; paintDraft();
    return withCsrf()
      .then(function (token) {
        return fetch('/api/studio/fund-drive/' + path, { method: 'POST', body: body ? JSON.stringify(body) : '{}',
          headers: { 'Content-Type': 'application/json', 'X-Studio-CSRF': token } });
      })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (x) {
        busy = false;
        if (x.status !== 200 || !x.d.ok) {
          if (x.status === 403) csrf = null;   // token expired: the next try fetches a fresh one
          say(status, (x.d.errors || [x.d.error || 'It could not be saved.']).join(' '), 'bad');
          paintDraft();
          return;
        }
        fill(x.d);
        say(status, okText, 'ok');
      })
      .catch(function (e) { busy = false; paintDraft(); say(status, 'It could not be saved: ' + e.message, 'bad'); });
  }
  function confirmThen(opts, act) {
    window.StudioDialog.confirm(opts).then(function (yes) { if (yes) act(); });
  }

  // The switch: on or off at once, after a confirm. It never flips on its own; fill() sets it from
  // what the server says is published.
  on.addEventListener('click', function () {
    if (busy || !published) return;
    var d = draft();
    if (!published.on) {
      if (!d.goal) {
        say(status, 'Type a goal first, then switch it on.', 'bad');
        goalIn.focus();
        return;
      }
      var figures = { name: d.name, goal: d.goal, pledged: d.pledged || 0, donateUrl: d.donateUrl };
      var warn = d.donateUrl && lastCheck.url === d.donateUrl && !lastCheck.frames ? ' Warning: the donate link may not open inside the Donate window (see the note under it).' : '';
      confirmThen({ title: 'Start the fund drive?', confirmLabel: 'Show it now',
        message: 'The banner and the donation capsule appear on Listen Live and in the embed within a minute. ' + summary(figures) + '.' + warn },
        function () { post('apply', body(true, figures), 'On. Listeners see it within a minute.'); });
    } else {
      var dropped = !same(d, published) ? ' The figures you typed and did not update are dropped.' : '';
      confirmThen({ title: 'Take the fund drive down?', confirmLabel: 'Take it down',
        message: 'The banner and the donation capsule leave Listen Live and the embed within a minute. The figures are kept for next time.' + dropped },
        function () { post('apply', body(false, published), 'Off. Listeners stop seeing it within a minute.'); });
    }
  });
  [nameIn, goalIn, pledgedIn, linkIn].forEach(function (i) { i.addEventListener('input', paintDraft); });
  linkIn.addEventListener('blur', checkLink);
  [goalIn, pledgedIn].forEach(function (i) {
    i.addEventListener('blur', function () { var n = digits(i.value); i.value = money(n); });
  });
  publish.addEventListener('click', function () {
    var d = draft();
    post('apply', body(published.on, d),
      published.on ? 'Updated. Listeners see the new figures within a minute.' : 'Saved. Not shown until the fund drive is switched on.');
  });
  discard.addEventListener('click', function () { load(); });
  undo.addEventListener('click', function () {
    var prev = lastHistory[0] && lastHistory[0].values;
    var back = prev ? (prev.on ? 'On' : 'Off') + ', ' + summary(prev) + '.' : 'the previous version.';
    confirmThen({ title: 'Undo the last change?', confirmLabel: 'Undo', message: 'This puts back: ' + back },
      function () { post('undo', null, 'Undone: the previous version is back.'); });
  });
  $('fdCopy').addEventListener('click', function () {
    var text = $('fdSnippet').textContent;
    var done = function () { say($('fdCopyStatus'), 'Copied.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function (e) {
        console.warn('[studio] copy refused:', e && e.message);
        say($('fdCopyStatus'), 'Copy was refused by the browser: select the text above and copy it.', 'bad');
      });
    } else say($('fdCopyStatus'), 'Select the text above and copy it.');
  });
  load();
})();
