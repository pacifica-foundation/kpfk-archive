/* Studio: Fund drive (Phase 4a, Paul 2026-10-27). The donation capsule's figures: on/off, an
 * optional name, the goal and the amount pledged. A draft until Publish; the preview is the real
 * capsule (public/fund-drive.js) drawn from the draft. Undo puts back the last published figures.
 * The server checks every edit (lib/fund-drive.js). Anyone signed in to the studio may edit. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var section = $('fundSection'), tabs = $('studioTabs');
  if (!section || !tabs || !window.FundDrive) return;
  var on = $('fdOn'), nameIn = $('fdName'), goalIn = $('fdGoal'), pledgedIn = $('fdPledged');
  var publish = $('fdPublish'), discard = $('fdDiscard'), undo = $('fdUndo'), status = $('fdStatus');
  // The preview shows the banner too (on top of Listen Live while the drive is on); its links go nowhere here.
  var preview = window.FundDrive.build($('fdPreview'), { donateHref: '#', banner: $('fdPreviewBanner') });
  [$('fdPreview').querySelector('.fd-btn'), $('fdPreviewBanner')].forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); }); });
  var published = null, csrf = null, busy = false, embedUrl = location.origin + '/embed/fund-drive', theme = 'light';
  // One colour choice for the preview, the snippet's ?theme= and Open the embed, so all three match.
  function paintTheme() {
    $('fdPreviewBox').setAttribute('data-theme-scope', theme);
    document.querySelectorAll('[data-fd-theme]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.fdTheme === theme ? 'true' : 'false'); });
    $('fdSnippet').textContent = '<iframe src="' + embedUrl + '?theme=' + theme + '" title="Fund drive" style="width:100%;height:170px;border:0" loading="lazy"></iframe>';
    $('fdOpenEmbed').href = '/embed/fund-drive?theme=' + theme;
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
  function draft() {
    return { on: on.getAttribute('aria-checked') === 'true', name: nameIn.value.replace(/\s+/g, ' ').trim(),
      goal: digits(goalIn.value), pledged: digits(pledgedIn.value) };
  }
  function same(a, b) { return a.on === b.on && a.name === b.name && a.goal === b.goal && a.pledged === b.pledged; }
  // The preview always shows a capsule (Paul, 2026-10-27: an empty preview until you type was
  // confusing): example figures until a goal is typed, then the draft. The tag says which.
  var EXAMPLE = { on: true, name: 'Fall Fund Drive', goal: 75000, pledged: 42350 };
  function paintDraft() {
    var d = draft();
    var changed = !!published && !same(d, published);
    var tag, note;
    if (!d.goal) {
      preview.paint(EXAMPLE);
      tag = 'Example'; note = 'Example figures. Type a goal and the amount pledged to see yours.';
    } else {
      preview.paint({ on: true, name: d.name, goal: d.goal, pledged: d.pledged || 0 });
      if (changed) { tag = 'Draft'; note = d.on ? 'Not published yet: Publish to show it on Listen Live.' : 'Switched off: Publish to take it down.'; }
      else if (d.on) { tag = 'Live'; note = 'Showing on Listen Live now.'; }
      else { tag = 'Off'; note = 'Not shown: switch it on and Publish to show it.'; }
    }
    $('fdPreviewTag').textContent = tag;
    $('fdPreviewNote').textContent = note;
    publish.disabled = busy || !changed;
    discard.hidden = !changed;
  }
  function fill(state) {
    var c = state.current;
    // Never set up: empty fields (null), so an untouched form is not a change to publish.
    published = { on: !!c.on, name: c.name || '', goal: c.goal || null, pledged: c.updatedAt ? (c.pledged || 0) : null };
    on.setAttribute('aria-checked', c.on ? 'true' : 'false');
    nameIn.value = c.name || '';
    goalIn.value = money(published.goal);
    pledgedIn.value = money(published.pledged);
    undo.hidden = !(state.history && state.history.length);
    embedUrl = state.embedUrl || (location.origin + '/embed/fund-drive');
    paintTheme();
    say(status, c.updatedAt ? (c.on ? 'On' : 'Off') + ' · last published ' + new Date(c.updatedAt).toLocaleString() : 'Not set up yet.');
    if (state.bootError) say(status, 'The saved figures could not be used (' + state.bootError + '). Publish new ones.', 'bad');
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
  function post(path, body) {
    busy = true; publish.disabled = true;
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
        say(status, path === 'undo' ? 'Undone: the previous figures are back.' : 'Published. Listeners see it within a minute.', 'ok');
      })
      .catch(function (e) { busy = false; paintDraft(); say(status, 'It could not be saved: ' + e.message, 'bad'); });
  }

  on.addEventListener('click', function () { on.setAttribute('aria-checked', on.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); paintDraft(); });
  [nameIn, goalIn, pledgedIn].forEach(function (i) { i.addEventListener('input', paintDraft); });
  [goalIn, pledgedIn].forEach(function (i) {
    i.addEventListener('blur', function () { var n = digits(i.value); i.value = money(n); });
  });
  publish.addEventListener('click', function () {
    var d = draft();
    post('apply', { on: d.on, name: d.name, goal: d.goal === null ? 0 : d.goal, pledged: d.pledged === null ? 0 : d.pledged });
  });
  discard.addEventListener('click', function () { load(); });
  undo.addEventListener('click', function () { post('undo'); });
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
