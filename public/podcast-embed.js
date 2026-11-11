/* The podcast player embed (/embed/podcasts): a show picker, the show's episodes and a player bar,
 * for other websites to put in an iframe. Radio Suite's player (components/embed/EmbedPlayer.tsx,
 * 2026-11-10) in plain JS; plan in docs/kpfk/podcast-embed-plan.md.
 *
 * Settings come from the link (public/podcast-embed-options.js). Shows and episodes come from
 * /api/archive, the same answer the site itself reads, so the embed lists exactly what the site
 * lists. Audio plays straight from the station's audio hosts, as on the site.
 *
 * One <audio> element for the whole player (episodes only). If a live button is ever added, read
 * docs/live-audio-pattern.md first: live uses a fresh element per play in this app.
 *
 * Plays and listening time are counted by /track.js, which listens from outside (no identifier).
 *
 * Show info and Transcript open as an overlay over the list, never over the player bar, which
 * stays in reach (Paul, 2026-11-11). One overlay at a time; Escape, the close button or a tap
 * outside closes it. No history entries: inside a frame they would land in the host page's Back.
 * Transcripts come from QIR through the site's own routes (docs/transcripts.md): the show's notes
 * say which episodes have one (/api/plugins/qir/notes?show=), the text is fetched on opening.
 *
 * The page sits inside someone else's page, so it never calls scrollIntoView (that can scroll the
 * host page too): it scrolls its own boxes by offset. */
(function () {
  'use strict';
  var PE = window.PodcastEmbed, root = document.getElementById('player');
  if (!PE || !root) { console.error('[podcast embed] the settings script or the page root is missing'); return; }
  var cfg = window.StationConfig;
  if (!cfg) { console.warn('[podcast embed] /station.js did not load: no station name or time zone'); cfg = {}; }

  var opts = PE.parseEmbedOptions(new URLSearchParams(location.search));
  var tz = cfg.timezone || 'UTC';
  var SPEEDS = [0.75, 1, 1.25, 1.5, 2], BACK_SECONDS = 15, FORWARD_SECONDS = 30;

  // ---- small builders ----
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  // Icons: fixed drawings from this file only (never feed text), 24 x 24.
  var SOLID = ' fill="currentColor" stroke="none"';
  var SKIP_ARROW = '<path d="M4.5 13a7.5 7.5 0 1 0 7.5-7.5H9"/><path d="M11.5 2.5l-3 3 3 3"/>';
  var SPEAKER = '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"' + SOLID + '/>';
  var ICONS = {
    play: '<path d="M8 5v14l11-7z"' + SOLID + '/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"' + SOLID + '/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z"' + SOLID + '/>',
    back: SKIP_ARROW + '<text x="12" y="15.7" text-anchor="middle">' + BACK_SECONDS + '</text>',
    forward: '<g transform="matrix(-1 0 0 1 24 0)">' + SKIP_ARROW + '</g><text x="12" y="15.7" text-anchor="middle">' + FORWARD_SECONDS + '</text>',
    volumeHigh: SPEAKER + '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    volumeLow: SPEAKER + '<path d="M15.5 9a4 4 0 0 1 0 6"/>',
    volumeOff: SPEAKER + '<path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
    transcript: '<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
    external: '<path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-5"/><circle cx="8.5" cy="14" r="2.5"/><path d="M14.5 12.5h3.5M14.5 15.5h3.5"/>'
  };
  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pe-ic');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = ICONS[name];
    return svg;
  }
  function setIcon(button, name) {
    if (button.dataset.icon === name) return;
    button.dataset.icon = name;
    button.textContent = '';
    button.appendChild(icon(name));
  }
  function iconButton(cls, name, label) {
    var b = el('button', cls);
    b.type = 'button';
    setIcon(b, name);
    if (label) { b.setAttribute('aria-label', label); b.title = label; }
    return b;
  }

  // ---- look: accents from the link, through CSSOM (the page's policy voids inline style="") ----
  root.style.setProperty('--pe-accent-dark', opts.darkColor);
  root.style.setProperty('--pe-accent-light', opts.lightColor);
  root.style.setProperty('--pe-on-accent-dark', PE.textOn(opts.darkColor));
  root.style.setProperty('--pe-on-accent-light', PE.textOn(opts.lightColor));

  // Theme: the link's choice; "auto" follows the visitor's system until they press the button.
  var systemLight = window.matchMedia('(prefers-color-scheme: light)');
  var chosenTheme = opts.theme === 'auto' ? null : opts.theme;
  var themeBtn = null;
  function theme() { return chosenTheme || (systemLight.matches ? 'light' : 'dark'); }
  function paintTheme() {
    var t = theme();
    root.setAttribute('data-theme', t);
    if (themeBtn) {
      themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      themeBtn.title = t === 'dark' ? 'Light theme' : 'Dark theme';
    }
  }
  if (opts.theme === 'auto') systemLight.addEventListener('change', paintTheme);

  // ---- state ----
  var shows = [], byKey = new Map();
  var shownShow = null, shownEpisodes = [], rows = new Map();   // rows: episode id -> { li, play }
  var current = null;        // { episode, show, queue }: queue is the list it was played from
  var playing = false, buffering = false, time = 0, duration = 0, buffered = 0;
  var speed = 1, volume = 1, muted = false;
  var notesState = 'unknown';   // 'unknown' | 'on' | 'off' (no transcripts on this station: stop asking)
  var notesLoaded = new Set();  // show keys whose notes arrived

  // ---- page skeleton ----
  // The stage holds everything above the player bar; overlays cover the stage only.
  var stage = el('div', 'pe-stage');
  root.appendChild(stage);
  if (opts.header) {
    var header = el('header', 'pe-header'), h1 = el('h1', 'pe-title');
    if (opts.headerIcon) h1.appendChild(icon('radio'));
    h1.appendChild(el('span', '', opts.title || cfg.name || ''));
    header.appendChild(h1);
    if (opts.themeToggle) {
      // A half-filled circle: the usual light/dark icon (a sun read as a settings gear, 2026-11-10)
      themeBtn = iconButton('pe-icon-btn', 'theme');
      themeBtn.addEventListener('click', function () { chosenTheme = theme() === 'dark' ? 'light' : 'dark'; paintTheme(); });
      header.appendChild(themeBtn);
    }
    stage.appendChild(header);
  }
  paintTheme();

  var pickerSlot = el('div');            // the show picker goes here once the shows are known
  pickerSlot.hidden = true;
  stage.appendChild(pickerSlot);
  var main = el('main', 'pe-main');
  stage.appendChild(main);
  var audio = el('audio');
  audio.preload = 'metadata';
  root.appendChild(audio);

  function message(text, kind) {
    var box = el('div', 'pe-empty');
    if (kind === 'loading') { box.setAttribute('aria-live', 'polite'); var sp = el('span', 'pe-spinner'); sp.setAttribute('aria-hidden', 'true'); box.appendChild(sp); }
    else if (kind === 'error') box.appendChild(icon('alert'));
    box.appendChild(el('p', '', text));
    return box;
  }
  function showOnly(node) { main.textContent = ''; main.appendChild(node); }
  showOnly(message('Loading…', 'loading'));

  // ---- toast ----
  var toastBox = el('div', 'pe-toast'), toastTimer = null;
  toastBox.setAttribute('role', 'alert');
  toastBox.hidden = true;
  function toast(text) {
    toastBox.textContent = '';
    toastBox.appendChild(icon('alert'));
    toastBox.appendChild(document.createTextNode(' ' + text));
    toastBox.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastBox.hidden = true; }, 4000);
  }

  // ---- artwork ----
  function placeholder(cls) {
    var box = el('div', cls + ' pe-cover-placeholder');
    box.setAttribute('aria-hidden', 'true');
    box.appendChild(icon('radio'));
    return box;
  }
  // Artwork is this site's own copy (/api/artwork/...); a missing or failing picture shows the drawing.
  function cover(src, cls) {
    if (!src) return placeholder(cls);
    var img = el('img', cls);
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', function () { if (img.parentNode) img.parentNode.replaceChild(placeholder(cls), img); });
    img.src = src;
    return img;
  }

  // ---- show picker (listbox: focus stays on the button; arrows, Enter, Escape) ----
  var picker = null;
  function buildPicker() {
    var section = el('section', 'pe-picker');
    var label = el('span', 'pe-picker-label', 'Show');
    label.id = 'pe-picker-label';
    var wrap = el('div', 'pe-dropdown');
    var button = el('button', 'pe-dropdown-btn');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-labelledby', 'pe-picker-label pe-picker-value');
    var text = el('span', 'pe-dropdown-text', 'Choose a show');
    text.id = 'pe-picker-value';
    button.appendChild(text);
    button.appendChild(icon('chevron'));
    var list = el('ul', 'pe-dropdown-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', 'pe-picker-label');
    list.hidden = true;
    var options = shows.map(function (s, i) {
      var li = el('li', 'pe-option');
      li.id = 'pe-option-' + i;
      li.setAttribute('role', 'option');
      li.appendChild(el('span', 'pe-option-title', s.title));
      li.appendChild(el('span', 'pe-option-count', String(s.episodeCount)));
      li.addEventListener('mouseenter', function () { setActive(i, false); });
      li.addEventListener('click', function () { choose(i); });
      list.appendChild(li);
      return li;
    });
    var open = false, active = 0;
    function selectedIndex() { return Math.max(0, shows.indexOf(shownShow)); }
    function setActive(i, scroll) {
      active = i;
      options.forEach(function (li, n) { li.classList.toggle('is-active', n === i); });
      button.setAttribute('aria-activedescendant', options[i].id);
      if (!scroll) return;
      // Keep the active option in view inside the list's own box
      var li = options[i];
      if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
    }
    function setOpen(on) {
      open = on;
      list.hidden = !on;
      button.classList.toggle('is-open', on);
      button.setAttribute('aria-expanded', String(on));
      if (on) setActive(selectedIndex(), true);
      else button.removeAttribute('aria-activedescendant');
    }
    // A different show closes the player: stopped if it was playing, the bar removed (Paul,
    // 2026-11-11). The same show again changes nothing.
    function choose(i) {
      setOpen(false);
      if (shows[i] === shownShow) return;
      closePlayer();
      selectShow(shows[i]);
    }
    button.addEventListener('click', function () { setOpen(!open); });
    button.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) { setOpen(true); return; }
        setActive(e.key === 'ArrowDown' ? Math.min(shows.length - 1, active + 1) : Math.max(0, active - 1), true);
      } else if ((e.key === 'Enter' || e.key === ' ') && open) {
        e.preventDefault();
        choose(active);
      }
    });
    document.addEventListener('mousedown', function (e) { if (open && !wrap.contains(e.target)) setOpen(false); });
    wrap.appendChild(button);
    wrap.appendChild(list);
    section.appendChild(label);
    section.appendChild(wrap);
    pickerSlot.parentNode.replaceChild(section, pickerSlot);
    picker = {
      paint: function () {
        text.textContent = shownShow ? shownShow.title : 'Choose a show';
        options.forEach(function (li, n) {
          var on = shows[n] === shownShow;
          li.classList.toggle('is-selected', on);
          li.setAttribute('aria-selected', String(on));
        });
      }
    };
  }

  // ---- the shown show ----
  function showInfo(show) {
    // Three parts so phones can give the description the card's full width: the cover, the
    // title and host beside it, and the rest (description, Show info, counts) under both.
    var section = el('section', 'pe-show' + (opts.cover ? '' : ' pe-show--no-cover'));
    if (opts.cover) section.appendChild(cover(show.image, 'pe-show-cover'));
    var head = el('div', 'pe-show-head');
    head.appendChild(el('h2', 'pe-show-title', show.title));
    if (show.host) head.appendChild(el('p', 'pe-show-host', show.host));
    section.appendChild(head);
    var meta = el('div', 'pe-show-meta');
    // Three lines here; the whole description, the links and the site's show page in Show info.
    if (show.description) meta.appendChild(el('p', 'pe-show-desc is-collapsed', show.description));
    var more = el('button', 'pe-pill-btn');
    more.type = 'button';
    more.appendChild(icon('info'));
    more.appendChild(el('span', '', 'Show info'));
    more.setAttribute('aria-haspopup', 'dialog');
    more.addEventListener('click', function () { openShowInfo(show, more); });
    meta.appendChild(more);
    var badges = el('div', 'pe-badges');
    badges.appendChild(el('span', 'pe-badge', show.episodeCount + (show.episodeCount === 1 ? ' episode' : ' episodes')));
    if (show.latestAt) badges.appendChild(el('span', 'pe-badge', 'Latest ' + PE.formatAirDate(show.latestAt, tz)));
    meta.appendChild(badges);
    section.appendChild(meta);
    return section;
  }

  function episodeRow(ep, show, queue) {
    var li = el('li', 'pe-episode');
    if (opts.cover) li.appendChild(cover(ep.image, 'pe-episode-cover'));
    var body = el('div', 'pe-episode-body');
    body.appendChild(el('div', 'pe-episode-title', ep.title));
    // An episode with no topic of its own is titled by its air time, so the date is not said twice.
    var meta = [ep.hasTopic && ep.airStart ? PE.formatAirDate(ep.airStart, tz) : '', PE.formatLength(ep.duration)].filter(Boolean).join(' · ');
    if (meta) body.appendChild(el('div', 'pe-episode-meta', meta));
    li.appendChild(body);
    var actions = el('div', 'pe-episode-actions');
    if (ep.transcriptId) {
      var tr = iconButton('pe-icon-btn pe-icon-btn--small pe-transcript-btn', 'transcript', 'Transcript');
      tr.setAttribute('aria-haspopup', 'dialog');
      tr.addEventListener('click', function () { openTranscript(ep, show, queue, tr); });
      actions.appendChild(tr);
    }
    if (ep.description) {
      // A child of the row, not of the title column, so it can use the card's full width.
      var desc = el('p', 'pe-episode-desc', ep.description);
      desc.hidden = true;
      var toggle = iconButton('pe-icon-btn pe-icon-btn--small', 'chevron');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Show description');
      toggle.addEventListener('click', function () {
        desc.hidden = !desc.hidden;
        toggle.setAttribute('aria-expanded', String(!desc.hidden));
        toggle.setAttribute('aria-label', desc.hidden ? 'Show description' : 'Hide description');
      });
      actions.appendChild(toggle);
    }
    var play = iconButton('pe-play-btn', 'play');
    play.setAttribute('aria-label', 'Play ' + ep.title);
    play.addEventListener('click', function () { playEpisode(ep, show, queue); });
    actions.appendChild(play);
    li.appendChild(actions);
    if (desc) li.appendChild(desc);
    rows.set(ep.id, { li: li, play: play, episode: ep });
    return li;
  }

  function selectShow(show, keepScroll) {
    var scroll = main.scrollTop;
    shownShow = show;
    shownEpisodes = PE.episodesToShow(show.episodes, opts.sort, opts.limit);
    rows = new Map();
    var frag = document.createDocumentFragment();
    frag.appendChild(showInfo(show));
    var section = el('section', 'pe-episodes'), heading = el('h3', 'pe-section-title');
    heading.appendChild(icon('list'));
    heading.appendChild(document.createTextNode(' Episodes'));
    section.appendChild(heading);
    var list = el('ul', 'pe-episode-list');
    shownEpisodes.forEach(function (ep) { list.appendChild(episodeRow(ep, show, shownEpisodes)); });
    section.appendChild(list);
    frag.appendChild(section);
    main.textContent = '';
    main.appendChild(frag);
    main.scrollTop = keepScroll ? scroll : 0;
    if (picker) picker.paint();
    paintRows();
    loadNotes(show);
  }

  // ---- QIR notes for the shown show: headlines, summaries, which episodes have a transcript ----
  function loadNotes(show) {
    if (notesState === 'off' || notesLoaded.has(show.key)) return;
    notesLoaded.add(show.key);
    fetch('/api/plugins/qir/notes?show=' + encodeURIComponent(show.key), { headers: { Accept: 'application/json' } })
      .then(function (r) {
        // 404: no Discovery or no QIR on this station, so no transcripts here. Not an error.
        if (r.status === 404) { notesState = 'off'; return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        if (!j) return;
        notesState = 'on';
        if (!PE.applyNotes(show, j.notes)) return;
        // Titles may have changed: redraw the list where it is, and the bar's title.
        if (shownShow === show) selectShow(show, true);
        if (current) { barTitle.textContent = current.episode.title; barTitle.title = current.episode.title; }
      })
      .catch(function (err) {
        // QIR or the server had a moment: the player works without transcripts; the next visit to
        // this show asks again.
        notesLoaded.delete(show.key);
        console.warn('[podcast embed] notes for ' + show.key + ' unavailable:', err.message);
      });
  }

  // ---- player bar ----
  var bar = el('div', 'pe-player');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Player');
  bar.hidden = true;
  var closeBtn = iconButton('pe-player-close', 'close', 'Close player');
  var barTitle = el('div', 'pe-player-title'), barShow = el('div', 'pe-player-show');
  var info = el('div', 'pe-player-info');
  info.appendChild(barTitle);
  info.appendChild(barShow);

  var progress = el('div', 'pe-progress'), track = el('div', 'pe-progress-track');
  var bufferedBar = el('div', 'pe-progress-buffered'), filledBar = el('div', 'pe-progress-filled');
  var seek = el('input', 'pe-progress-input');
  seek.type = 'range'; seek.min = '0'; seek.max = '0'; seek.step = '1'; seek.value = '0'; seek.disabled = true;
  seek.setAttribute('aria-label', 'Seek');
  track.appendChild(bufferedBar);
  track.appendChild(filledBar);
  track.appendChild(seek);
  var times = el('div', 'pe-times'), timeNow = el('span', '', '0:00'), timeEnd = el('span', '', '0:00');
  times.appendChild(timeNow);
  times.appendChild(timeEnd);
  progress.appendChild(track);
  progress.appendChild(times);

  var controls = el('div', 'pe-controls');
  var backBtn = iconButton('pe-ctrl pe-ctrl--skip', 'back', 'Back ' + BACK_SECONDS + ' seconds');
  var playBtn = iconButton('pe-ctrl pe-ctrl--play', 'play', 'Play');
  playBtn.removeAttribute('title');
  var forwardBtn = iconButton('pe-ctrl pe-ctrl--skip', 'forward', 'Forward ' + FORWARD_SECONDS + ' seconds');
  var speedWrap = el('div', 'pe-speed'), speedBtn = el('button', 'pe-ctrl pe-ctrl--text', '1x');
  speedBtn.type = 'button';
  speedBtn.setAttribute('aria-expanded', 'false');
  var speedMenu = el('div', 'pe-speed-menu');
  speedMenu.setAttribute('role', 'menu');
  speedMenu.hidden = true;
  var speedItems = SPEEDS.map(function (s) {
    var b = el('button', '', s + 'x');
    b.type = 'button';
    b.setAttribute('role', 'menuitemradio');
    b.addEventListener('click', function () { setRate(s); });
    speedMenu.appendChild(b);
    return b;
  });
  speedWrap.appendChild(speedBtn);
  speedWrap.appendChild(speedMenu);
  var volumeWrap = el('div', 'pe-volume'), muteBtn = iconButton('pe-ctrl', 'volumeHigh', 'Mute');
  muteBtn.removeAttribute('title');
  var volumeInput = el('input', 'pe-volume-input');
  volumeInput.type = 'range'; volumeInput.min = '0'; volumeInput.max = '1'; volumeInput.step = '0.05'; volumeInput.value = '1';
  volumeInput.setAttribute('aria-label', 'Volume');
  volumeWrap.appendChild(muteBtn);
  volumeWrap.appendChild(volumeInput);
  [backBtn, playBtn, forwardBtn, speedWrap, volumeWrap].forEach(function (n) { controls.appendChild(n); });
  [closeBtn, info, progress, controls].forEach(function (n) { bar.appendChild(n); });
  root.appendChild(bar);
  root.appendChild(toastBox);

  function paintRows() {
    rows.forEach(function (row, id) {
      var isCurrent = !!current && current.episode.id === id, on = isCurrent && playing;
      row.li.classList.toggle('is-current', isCurrent);
      setIcon(row.play, on ? 'pause' : 'play');
      row.play.setAttribute('aria-label', (on ? 'Pause ' : 'Play ') + row.episode.title);
    });
  }
  function paintPlayButton() {
    if (buffering && playing) {
      if (playBtn.dataset.icon !== 'spinner') {
        playBtn.dataset.icon = 'spinner';
        playBtn.textContent = '';
        var sp = el('span', 'pe-spinner pe-spinner--small');
        sp.setAttribute('aria-hidden', 'true');
        playBtn.appendChild(sp);
      }
    } else setIcon(playBtn, playing ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  function paintPlaying() { paintPlayButton(); paintRows(); }
  function paintTime() {
    var pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
    filledBar.style.width = pct + '%';
    bufferedBar.style.width = (buffered * 100) + '%';
    seek.max = String(Math.floor(duration || 0));
    seek.value = String(Math.min(time, duration || 0));
    seek.disabled = !duration;
    seek.setAttribute('aria-valuetext', PE.formatTime(time) + ' of ' + PE.formatTime(duration));
    timeNow.textContent = PE.formatTime(time);
    timeEnd.textContent = PE.formatTime(duration);
  }
  function paintVolume() {
    setIcon(muteBtn, muted || volume === 0 ? 'volumeOff' : volume < 0.5 ? 'volumeLow' : 'volumeHigh');
    muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    volumeInput.value = String(muted ? 0 : volume);
    audio.volume = volume;
    audio.muted = muted;
  }
  function paintSpeed() {
    speedBtn.textContent = speed + 'x';
    speedBtn.setAttribute('aria-label', 'Playback speed ' + speed + 'x');
    speedItems.forEach(function (b, i) {
      var on = SPEEDS[i] === speed;
      b.className = on ? 'is-active' : '';
      b.setAttribute('aria-checked', String(on));
    });
  }
  function paintCurrent() {
    bar.hidden = !current;
    if (current) {
      barTitle.textContent = current.episode.title;
      barTitle.title = current.episode.title;
      barShow.textContent = current.show.title;
    }
    paintPlaying();
    paintTime();
  }

  // ---- playing ----
  // A failed load arrives as the element's "error" event (handled below). What rejects here is a
  // browser refusing to start sound, or a newer play/pause replacing this one (AbortError, not a
  // failure). Logged either way, never swallowed.
  function startAudio() {
    var p = audio.play();
    if (p && p.catch) p.catch(function (err) {
      if (err && err.name === 'AbortError') return;
      console.warn('[podcast embed] play did not start:', err);
    });
  }
  function load(ep, show, queue) {
    current = { episode: ep, show: show, queue: queue };
    time = 0; duration = ep.duration; buffered = 0;
    audio.src = ep.audioUrl;
    audio.playbackRate = speed;   // a new source resets the rate
  }
  function playEpisode(ep, show, queue) {
    if (current && current.episode.id === ep.id) return togglePlay();
    load(ep, show, queue);
    startAudio();
    paintCurrent();
  }
  // From a transcript line: this episode from that second, loading it first if another is in the bar.
  function playAt(ep, show, queue, seconds) {
    if (!current || current.episode.id !== ep.id) { load(ep, show, queue); paintCurrent(); }
    // A source still loading takes the start time once it knows its length.
    if (audio.readyState >= 1) audio.currentTime = seconds;
    else audio.addEventListener('loadedmetadata', function once() { audio.removeEventListener('loadedmetadata', once); audio.currentTime = seconds; });
    time = seconds;
    paintTime();
    if (audio.paused) startAudio();
  }
  function togglePlay() {
    if (!current) return;
    if (audio.paused) startAudio(); else audio.pause();
  }
  function skip(seconds) {
    var end = isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(end, audio.currentTime + seconds));
  }
  function closePlayer() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    current = null; playing = false; buffering = false;
    paintCurrent();
  }
  function setRate(rate) {
    speed = rate;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    setSpeedOpen(false);
    paintSpeed();
  }
  function setSpeedOpen(on) {
    speedMenu.hidden = !on;
    speedBtn.setAttribute('aria-expanded', String(on));
  }

  closeBtn.addEventListener('click', closePlayer);
  playBtn.addEventListener('click', togglePlay);
  backBtn.addEventListener('click', function () { skip(-BACK_SECONDS); });
  forwardBtn.addEventListener('click', function () { skip(FORWARD_SECONDS); });
  speedBtn.addEventListener('click', function () { setSpeedOpen(speedMenu.hidden); });
  document.addEventListener('mousedown', function (e) { if (!speedMenu.hidden && !speedWrap.contains(e.target)) setSpeedOpen(false); });
  speedWrap.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !speedMenu.hidden) { setSpeedOpen(false); speedBtn.focus(); } });
  muteBtn.addEventListener('click', function () { muted = !muted; paintVolume(); });
  volumeInput.addEventListener('input', function () { volume = Number(volumeInput.value); muted = false; paintVolume(); });
  seek.addEventListener('input', function () { time = Number(seek.value); audio.currentTime = time; paintTime(); });

  audio.addEventListener('timeupdate', function () { time = audio.currentTime; paintTime(); followTranscript(); });
  audio.addEventListener('durationchange', function () { if (isFinite(audio.duration)) { duration = audio.duration; paintTime(); } });
  audio.addEventListener('progress', function () {
    if (audio.buffered.length && isFinite(audio.duration) && audio.duration > 0) {
      buffered = audio.buffered.end(audio.buffered.length - 1) / audio.duration;
      paintTime();
    }
  });
  audio.addEventListener('play', function () { playing = true; paintPlaying(); });
  audio.addEventListener('pause', function () { playing = false; paintPlaying(); });
  audio.addEventListener('waiting', function () { buffering = true; paintPlayButton(); });
  audio.addEventListener('playing', function () { buffering = false; paintPlayButton(); });
  audio.addEventListener('ended', function () {
    // Play on: the next episode in the list this one was played from, as it was shown
    if (!current) return;
    var i = current.queue.indexOf(current.episode), next = i >= 0 ? current.queue[i + 1] : undefined;
    if (next) playEpisode(next, current.show, current.queue);
    else { playing = false; paintPlaying(); }
  });
  audio.addEventListener('error', function () {
    if (!audio.getAttribute('src')) return;   // closing the player clears the source; not an error
    console.warn('[podcast embed] audio error:', audio.error && audio.error.code, audio.currentSrc);
    playing = false; buffering = false;
    paintPlaying();
    toast("This episode can't be played right now.");
  });

  paintSpeed();
  paintVolume();

  // ---- overlays: Show info and Transcript, over the list, under nothing but the bar ----
  var layer = el('div', 'pe-layer');
  layer.hidden = true;
  var scrim = el('div', 'pe-scrim');
  var sheet = el('section', 'pe-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-labelledby', 'pe-sheet-title');
  var sheetHead = el('div', 'pe-sheet-head');
  var sheetHeading = el('div', 'pe-sheet-heading');
  var sheetKind = el('p', 'pe-sheet-kind'), sheetTitle = el('h2', 'pe-sheet-title'), sheetSub = el('p', 'pe-sheet-sub');
  sheetTitle.id = 'pe-sheet-title';
  [sheetKind, sheetTitle, sheetSub].forEach(function (n) { sheetHeading.appendChild(n); });
  var sheetClose = iconButton('pe-icon-btn', 'close', 'Close');
  sheetHead.appendChild(sheetHeading);
  sheetHead.appendChild(sheetClose);
  var sheetBody = el('div', 'pe-sheet-body');
  sheet.appendChild(sheetHead);
  sheet.appendChild(sheetBody);
  layer.appendChild(scrim);
  layer.appendChild(sheet);
  stage.appendChild(layer);
  var opener = null, layerKind = '';

  function openLayer(kind, label, title, sub, from) {
    layerKind = kind;
    opener = from || null;
    sheetKind.textContent = label;
    sheetTitle.textContent = title;
    sheetSub.textContent = sub || '';
    sheetSub.hidden = !sub;
    sheetBody.textContent = '';
    sheetBody.scrollTop = 0;
    [].forEach.call(sheet.querySelectorAll('.pe-now-btn'), function (b) { b.remove(); });
    sheet.className = 'pe-sheet pe-sheet--' + kind;
    layer.hidden = false;
    // What is under the overlay takes no focus or taps; the player bar stays live.
    [].forEach.call(stage.children, function (n) { if (n !== layer) n.inert = true; });
    sheetClose.focus();
  }
  function closeLayer() {
    if (layer.hidden) return;
    layer.hidden = true;
    layerKind = '';
    transcript = null;
    [].forEach.call(stage.children, function (n) { n.inert = false; });
    if (opener && opener.isConnected) opener.focus();
    opener = null;
  }
  sheetClose.addEventListener('click', closeLayer);
  scrim.addEventListener('click', closeLayer);
  layer.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); closeLayer(); } });
  // Escape from the player bar closes an open overlay too (focus may have moved down to it).
  bar.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !layer.hidden && speedMenu.hidden) closeLayer(); });

  function openShowInfo(show, from) {
    openLayer('info', 'Show info', show.title, show.host, from);
    var body = el('div', 'pe-info');
    if (opts.cover) body.appendChild(cover(show.image, 'pe-info-cover'));
    var text = el('div', 'pe-info-text');
    if (show.category) text.appendChild(el('p', 'pe-info-cat', show.category));
    text.appendChild(el('p', 'pe-info-desc', show.description || 'No description for this show yet.'));
    var badges = el('div', 'pe-badges');
    badges.appendChild(el('span', 'pe-badge', show.episodeCount + (show.episodeCount === 1 ? ' episode' : ' episodes')));
    if (show.latestAt) badges.appendChild(el('span', 'pe-badge', 'Latest ' + PE.formatAirDate(show.latestAt, tz)));
    text.appendChild(badges);
    var links = el('div', 'pe-info-links');
    // Links open a new tab: this player sits on someone else's page.
    function link(label, href, primary) {
      var a = el('a', 'pe-link' + (primary ? ' pe-link--primary' : ''));
      a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.appendChild(el('span', '', label));
      a.appendChild(icon('external'));
      links.appendChild(a);
    }
    link('All episodes on ' + ((cfg.name ? cfg.name + ' ' : '') + 'Podcasts'), location.origin + show.sitePath, true);
    show.links.forEach(function (l) { link(l.label, l.url); });
    text.appendChild(links);
    body.appendChild(text);
    sheetBody.appendChild(body);
  }

  // ---- transcripts ----
  var transcript = null;          // { ep, lines: [{start, el}], following, nowIndex } while one is open
  var transcriptCache = new Map(), parserReady = null;
  // The parser is the site's own (plugins/discovery/public/qir-transcript.js), loaded on first use:
  // a station without Discovery never asks for it.
  function loadParser() {
    if (window.QirTranscript) return Promise.resolve();
    if (parserReady) return parserReady;
    parserReady = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = '/discover/qir-transcript.js';
      sc.onload = function () { window.QirTranscript ? resolve() : reject(new Error('parser did not register')); };
      sc.onerror = function () { reject(new Error('parser did not load')); };
      document.head.appendChild(sc);
    });
    parserReady.catch(function () { parserReady = null; });
    return parserReady;
  }
  function fetchTranscript(ep) {
    if (transcriptCache.has(ep.id)) return Promise.resolve(transcriptCache.get(ep.id));
    return Promise.all([loadParser(), fetch('/api/plugins/qir/transcript/' + encodeURIComponent(ep.transcriptId), { headers: { Accept: 'application/json' } })])
      .then(function (both) {
        var r = both[1];
        // The site's words for these two cases (docs/transcripts.md)
        if (!r.ok) throw Object.assign(new Error(r.status === 404 ? 'There is no transcript for this episode yet.' : 'The transcript service is unavailable. Try again shortly.'), { shown: true, status: r.status });
        return r.json();
      })
      .then(function (j) {
        var data = { lines: window.QirTranscript.parse(j.vtt, ep.duration), text: j.transcript || '',
          lang: window.PlainText && window.PlainText.langCode ? window.PlainText.langCode(j.language) : '' };
        if (transcriptCache.size >= 20) transcriptCache.delete(transcriptCache.keys().next().value);
        transcriptCache.set(ep.id, data);
        return data;
      });
  }
  function openTranscript(ep, show, queue, from) {
    var sub = [show.title, ep.airStart ? PE.formatAirDate(ep.airStart, tz) : ''].filter(Boolean).join(' · ');
    openLayer('transcript', 'Transcript', ep.title, sub, from);
    if (window.ArchiveStats) window.ArchiveStats.count('transcriptOpen');
    var mine = transcript = { ep: ep, show: show, queue: queue, lines: [], following: true, nowIndex: -1 };
    sheetBody.appendChild(message('Loading the transcript…', 'loading'));
    fetchTranscript(ep).then(function (data) {
      if (transcript !== mine) return;   // closed, or another opened meanwhile
      sheetBody.textContent = '';
      if (data.lang) sheetBody.lang = data.lang; else sheetBody.removeAttribute('lang');
      if (!data.lines.length) {
        // No timings: the plain text, in paragraphs
        var plain = el('div', 'pe-transcript-plain');
        (data.text || 'This transcript is empty.').split(/\n{2,}/).forEach(function (para) { plain.appendChild(el('p', '', para)); });
        sheetBody.appendChild(plain);
        return;
      }
      var hint = el('p', 'pe-transcript-hint', 'Tap a line to play from there.');
      var now = el('button', 'pe-now-btn', 'Back to now');
      now.type = 'button';
      now.hidden = true;
      now.addEventListener('click', function () { mine.following = true; now.hidden = true; followTranscript(true); });
      mine.nowBtn = now;
      var list = el('ol', 'pe-transcript');
      data.lines.forEach(function (l) {
        var li = el('li'), b = el('button', 'pe-line');
        b.type = 'button';
        b.appendChild(el('span', 'pe-line-time', PE.formatTime(l.start)));
        b.appendChild(el('span', 'pe-line-text', l.text));
        b.addEventListener('click', function () { mine.following = true; now.hidden = true; playAt(ep, show, queue, l.start); });
        li.appendChild(b);
        list.appendChild(li);
        mine.lines.push({ start: l.start, el: b });
      });
      sheetBody.appendChild(hint);
      sheetBody.appendChild(list);
      sheet.appendChild(now);
      followTranscript(true);
    }, function (err) {
      if (transcript !== mine) return;
      if (!err.shown) console.error('[podcast embed] transcript ' + ep.transcriptId + ':', err);
      else if (err.status !== 404) console.warn('[podcast embed] transcript ' + ep.transcriptId + ': HTTP ' + err.status);
      sheetBody.textContent = '';
      sheetBody.appendChild(message(err.shown ? err.message : 'The transcript could not be shown. Try again shortly.', 'error'));
    });
  }
  // The line being heard, marked and kept in view while following. Scrolling by hand stops the
  // following (Back to now resumes it). Only for the episode in the bar.
  function followTranscript(force) {
    var t = transcript;
    if (!t || !t.lines.length) return;
    var mine = current && current.episode.id === t.ep.id;
    var i = -1;
    if (mine) {
      var lo = 0, hi = t.lines.length - 1, at = audio.currentTime || 0;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (t.lines[mid].start <= at) { i = mid; lo = mid + 1; } else hi = mid - 1; }
    }
    if (i !== t.nowIndex) {
      if (t.nowIndex >= 0) { t.lines[t.nowIndex].el.classList.remove('is-now'); t.lines[t.nowIndex].el.removeAttribute('aria-current'); }
      if (i >= 0) { t.lines[i].el.classList.add('is-now'); t.lines[i].el.setAttribute('aria-current', 'true'); }
      t.nowIndex = i;
    } else if (!force) return;
    if (i < 0 || !t.following) return;
    var line = t.lines[i].el.parentNode;
    var top = line.offsetTop - sheetBody.clientHeight / 3;
    var before = sheetBody.scrollTop;
    if (Math.abs(before - top) <= 4) return;
    sheetBody.scrollTop = Math.max(0, top);
    // Our own scroll fires a scroll event; mark it, but only when the box really moved.
    if (sheetBody.scrollTop !== before) t.autoScroll = true;
  }
  // A scroll the listener made (not ours) stops following.
  sheetBody.addEventListener('scroll', function () {
    var t = transcript;
    if (!t) return;
    if (t.autoScroll) { t.autoScroll = false; return; }
    if (t.following && t.nowIndex >= 0) { t.following = false; if (t.nowBtn) t.nowBtn.hidden = false; }
  }, { passive: true });

  // ---- load the site's feed ----
  function start(archive) {
    shows = PE.orderShows(PE.showsFromArchive(archive), opts.order);
    byKey = new Map(shows.map(function (s) { return [s.key, s]; }));
    if (!shows.length) return showOnly(message('No episodes to play yet.', 'error'));

    // A link with episode= opens that episode in the bar; it also decides the show when show= is absent.
    var linked = null;
    if (opts.episode) {
      shows.some(function (s) {
        var ep = s.episodes.filter(function (e) { return e.id === opts.episode; })[0];
        if (ep && (!opts.show || s.key === opts.show)) linked = { episode: ep, show: s };
        return !!linked;
      });
    }
    var first = opts.show ? byKey.get(opts.show) : linked ? linked.show : shows[0];
    if (!first) return showOnly(message('This show has no episodes to play right now.', 'error'));

    if (opts.selector && shows.length > 1) buildPicker();
    selectShow(first);

    if (linked) {
      // No autoplay: browsers block sound before the visitor clicks, so it waits for Play.
      load(linked.episode, linked.show, shownEpisodes.indexOf(linked.episode) >= 0 ? shownEpisodes : [linked.episode]);
      paintCurrent();
      var row = rows.get(linked.episode.id);
      if (row) requestAnimationFrame(function () {
        main.scrollTop = Math.max(0, row.li.offsetTop - (main.clientHeight - row.li.offsetHeight) / 2);
      });
    }
  }

  fetch('/api/archive', { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(start, function (err) {
      // The feed could not be fetched or read. A fault in start() itself is not caught here: it
      // stays an uncaught error, where the page-load test and the console can see it.
      console.error('[podcast embed] could not load /api/archive:', err);
      showOnly(message('Could not load shows. Please try again later.', 'error'));
    });
})();
