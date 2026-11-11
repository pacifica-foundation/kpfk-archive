/* The podcast player embed's settings, carried in its link (/embed/podcasts?show=...&theme=light),
 * plus the ordering and formatting the player uses. Ported from Radio Suite (lib/embed-options.ts,
 * lib/embed-view.ts, 2026-11-10); plan in docs/kpfk/podcast-embed-plan.md.
 *
 * The studio's Embeds tab writes the link with embedQuery; the player reads it with
 * parseEmbedOptions. Both load this file, so the two can never disagree about a name or a default.
 * Only settings that differ from the default go in the link.
 *
 * A value the player does not understand (a typo in a pasted embed code, an old link) is ignored
 * and that one setting's default used: the embed sits on someone else's page, so it must still
 * play rather than show an error about its own settings.
 *
 * No download setting (Radio Suite dropped its download buttons, Paul 2026-11-10) and no icon
 * setting (this app has no Font Awesome; the header icon is one fixed drawing).
 *
 * Runs in the browser (window.PodcastEmbed) and in Node (tests). */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PodcastEmbed = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var THEMES = ['dark', 'light', 'auto'];
  var EPISODE_SORTS = ['newest', 'oldest', 'alphabetical'];
  var SHOW_ORDERS = ['alphabetical', 'latest', 'most-episodes'];
  var EPISODE_LIMITS = [5, 10, 25, 50];

  // Ready-made accent pairs for the Embeds tab (one click sets both themes). Each passes the same
  // checks (test/pacifica/podcast-embed.test.js): the colour reads as text on its theme's
  // background (4.5:1) and the play icon on it reads (textOn, 3:1). The default is the site's own
  // on-air red (Paul, 2026-11-11: the embed looks like the site); Tuning teal is the site's second
  // colour; Graphite is the black and white Radio Suite uses.
  var ACCENT_PRESETS = [
    { name: 'On-air red', dark: '#e14a2e', light: '#c8371e' },
    // Adjusted a hair to read on the site's warm backgrounds: this teal (the site's #0d7d72 is
    // 4.46:1 on cream), Violet's dark shade and Amber's light one.
    { name: 'Tuning teal', dark: '#4fb6ac', light: '#0d796f' },
    { name: 'Graphite', dark: '#e5e7eb', light: '#18181b' },
    { name: 'Blue', dark: '#3b82f6', light: '#2563eb' },
    { name: 'Sky', dark: '#0284c7', light: '#0369a1' },
    { name: 'Emerald', dark: '#059669', light: '#047857' },
    { name: 'Indigo', dark: '#7c7ff5', light: '#4338ca' },
    { name: 'Violet', dark: '#8e61f6', light: '#6d28d9' },
    { name: 'Pink', dark: '#ec4899', light: '#be185d' },
    { name: 'Rose', dark: '#f43f5e', light: '#be123c' },
    { name: 'Amber', dark: '#d97706', light: '#b05109' }
  ];

  // The player's backgrounds (public/podcast-embed.css: the site's --surface-0), for the contrast checks.
  var THEME_BACKGROUND = { dark: '#14100f', light: '#f6f1ea' };

  var DEFAULT_OPTIONS = Object.freeze({
    show: null,          // show key to start on; null = first in the picker
    episode: null,       // episode id to open in the player bar
    theme: 'dark',
    sort: 'newest',
    limit: null,         // newest N episodes; null = all the site lists
    order: 'alphabetical', // order of the show picker
    header: true,
    selector: true,      // the show picker
    cover: true,
    themeToggle: true,
    title: null,         // header title; null = the station's name
    headerIcon: true,
    darkColor: ACCENT_PRESETS[0].dark,   // #rrggbb, accent in the dark theme
    lightColor: ACCENT_PRESETS[0].light  // #rrggbb, accent in the light theme
  });

  var TITLE_MAX = 60;
  // Show keys and episode ids as the feed writes them: kpfk.kpfk.qrcode, kpfk.2kpfk.140923.
  var KEY_RE = /^[A-Za-z0-9._-]{1,100}$/;
  var HEX_RE = /^#?([0-9a-fA-F]{6})$/;

  // Link parameter for each setting.
  var PARAM = {
    show: 'show', episode: 'episode', theme: 'theme', sort: 'sort', limit: 'limit', order: 'order',
    header: 'header', selector: 'selector', cover: 'cover', themeToggle: 'theme_toggle',
    title: 'title', headerIcon: 'header_icon', darkColor: 'dark', lightColor: 'light'
  };
  var BOOLEAN_KEYS = ['header', 'selector', 'cover', 'themeToggle', 'headerIcon'];

  function oneOf(list, raw, fallback) { return raw !== null && list.indexOf(raw) >= 0 ? raw : fallback; }

  function normalizeHex(raw) {
    var m = raw === null || raw === undefined ? null : HEX_RE.exec(String(raw).trim());
    return m ? '#' + m[1].toLowerCase() : null;
  }

  /** Settings from the player's link (a URLSearchParams). Unknown or bad values fall back to the default. */
  function parseEmbedOptions(params) {
    var get = function (name) { return params.get(name); };
    var d = DEFAULT_OPTIONS;
    var key = function (raw) { return raw !== null && KEY_RE.test(raw) ? raw : null; };
    var limit = Number(get(PARAM.limit));
    var out = {
      show: key(get(PARAM.show)),
      episode: key(get(PARAM.episode)),
      theme: oneOf(THEMES, get(PARAM.theme), d.theme),
      sort: oneOf(EPISODE_SORTS, get(PARAM.sort), d.sort),
      limit: EPISODE_LIMITS.indexOf(limit) >= 0 ? limit : null,
      order: oneOf(SHOW_ORDERS, get(PARAM.order), d.order),
      title: (get(PARAM.title) || '').trim().slice(0, TITLE_MAX) || null,
      darkColor: normalizeHex(get(PARAM.darkColor)) || d.darkColor,
      lightColor: normalizeHex(get(PARAM.lightColor)) || d.lightColor
    };
    BOOLEAN_KEYS.forEach(function (k) {
      var raw = get(PARAM[k]);
      out[k] = raw === 'false' || raw === '0' ? false : raw === 'true' || raw === '1' ? true : d[k];
    });
    return out;
  }

  /** The link's query string for these settings (no leading "?"), defaults left out. */
  function embedQuery(opts) {
    var q = new URLSearchParams(), d = DEFAULT_OPTIONS;
    if (opts.show) q.set(PARAM.show, opts.show);
    if (opts.episode) q.set(PARAM.episode, opts.episode);
    if (opts.theme !== d.theme) q.set(PARAM.theme, opts.theme);
    if (opts.sort !== d.sort) q.set(PARAM.sort, opts.sort);
    if (opts.limit !== null) q.set(PARAM.limit, String(opts.limit));
    if (opts.order !== d.order) q.set(PARAM.order, opts.order);
    BOOLEAN_KEYS.forEach(function (k) { if (opts[k] !== d[k]) q.set(PARAM[k], String(opts[k])); });
    var title = (opts.title || '').trim().slice(0, TITLE_MAX);
    if (title) q.set(PARAM.title, title);
    // Colours without "#", so the link needs no escaping
    var dark = normalizeHex(opts.darkColor), light = normalizeHex(opts.lightColor);
    if (dark && dark !== d.darkColor) q.set(PARAM.darkColor, dark.slice(1));
    if (light && light !== d.lightColor) q.set(PARAM.lightColor, light.slice(1));
    return q.toString();
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** The HTML a website pastes in to show the player. */
  function iframeCode(src, width, height, title) {
    return '<iframe src="' + escapeAttr(src) + '" title="' + escapeAttr(title) + '" width="' + escapeAttr(width) +
      '" height="' + escapeAttr(height) + '" style="border:0;max-width:100%" allow="autoplay" loading="lazy"></iframe>';
  }

  function luminance(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  /**
   * Icon colour on an accent-coloured button: white whenever it is readable (WCAG 1.4.11, 3:1 for
   * icons and controls), black only on light accents such as yellow, where white would disappear.
   */
  function textOn(hex) {
    var h = normalizeHex(hex) || DEFAULT_OPTIONS.darkColor;
    return 1.05 / (luminance(h) + 0.05) >= 3 ? '#ffffff' : '#000000';
  }

  // ---- Ordering and formatting (pure, so tests can check them without a browser) ----

  function byTitle(a, b) { return a.title.localeCompare(b.title); }

  /** Shows for the picker. latestAt is the newest episode's air time (seconds), 0 when none. */
  function orderShows(shows, order) {
    var copy = shows.slice();
    if (order === 'latest') return copy.sort(function (a, b) { return (b.latestAt || 0) - (a.latestAt || 0) || byTitle(a, b); });
    if (order === 'most-episodes') return copy.sort(function (a, b) { return b.episodeCount - a.episodeCount || byTitle(a, b); });
    return copy.sort(byTitle);
  }

  /**
   * The episodes the list shows: the newest `limit` broadcasts (all when null), then put in the
   * chosen order. "Latest 5, oldest first" is the newest five from oldest to newest, never the
   * station's five oldest.
   */
  function episodesToShow(episodes, sort, limit) {
    var newestFirst = episodes.slice().sort(function (a, b) { return b.airStart - a.airStart; });
    var kept = limit === null ? newestFirst : newestFirst.slice(0, limit);
    if (sort === 'oldest') return kept.reverse();
    if (sort === 'alphabetical') return kept.sort(function (a, b) { return a.title.localeCompare(b.title, undefined, { numeric: true }); });
    return kept;
  }

  /** 3725 -> "1:02:05", 59 -> "0:59". */
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    var s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    var sec = String(s % 60).padStart(2, '0');
    return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  }

  /** "1 hr 5 min", "58 min"; empty when not known. */
  function formatLength(seconds) {
    if (!seconds || seconds < 60) return '';
    var h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
    if (m === 60) { h += 1; m = 0; }
    if (h === 0) return m + ' min';
    return m === 0 ? h + ' hr' : h + ' hr ' + m + ' min';
  }

  /** The broadcast day in the station's time zone: "Nov 3, 2026". airStart is in seconds. */
  function formatAirDate(airStart, timeZone) {
    return new Date(airStart * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone });
  }

  // ---- The site's feed, as the player lists it ----

  // A published topic is the episode's title only when it reads like one; some producers paste the
  // whole description into it. The same rule and length as the site (public/archive-search.js).
  var TOPIC_MAX = 200;
  function topicOf(row) {
    var p = (row.published || []).filter(function (x) { return x && x.topic && String(x.topic).trim(); })[0];
    var t = p ? String(p.topic).trim() : '';
    return t.length <= TOPIC_MAX ? t : '';
  }

  /**
   * Shows with their episodes, from /api/archive exactly as the site serves it: the embed lists
   * what the site lists (withheld shows, short recordings and unscheduled programmes are already
   * out), never a second rule. A show with no episodes is left out. Returns a list; look shows up
   * through a Map, never a plain object (a key comes from the link).
   */
  function showsFromArchive(archive) {
    var directory = (archive && archive.directory) || {}, rows = (archive && archive.shows) || [];
    var byKey = new Map();
    rows.forEach(function (r) {
      if (!r || !r.sho || !r.mp3 || !r.id) return;
      var show = byKey.get(r.sho);
      if (!show) {
        var info = Object.prototype.hasOwnProperty.call(directory, r.sho) ? directory[r.sho] : {};
        show = {
          key: r.sho, title: info.name || r.title || r.sho, host: info.dj || '',
          description: info.desc || info.shortdesc || '', image: info.photo || r.photo || '',
          category: info.categoryLabel || r.categoryLabel || '',
          // The show's page on this site (public/links.js showPath) and its own links, web only
          sitePath: '/show/' + encodeURIComponent(String(r.sho).split('.').pop()),
          links: [['Website', info.url], ['Facebook', info.facebook], ['X', info.twitter]]
            .filter(function (l) { return webLink(l[1]); }).map(function (l) { return { label: l[0], url: l[1] }; }),
          episodeCount: 0, latestAt: 0, episodes: []
        };
        byKey.set(r.sho, show);
      }
      var topic = topicOf(r);
      show.episodes.push({
        id: r.id, title: topic || r.dateText || show.title, hasTopic: !!topic, airStart: r.dt || 0,
        duration: r.durationSec || 0, description: r.episodeDesc || '', audioUrl: r.mp3,
        image: r.photo || show.image, transcriptId: ''
      });
      show.episodeCount += 1;
      if ((r.dt || 0) > show.latestAt) show.latestAt = r.dt;
    });
    return Array.from(byKey.values());
  }

  function webLink(u) { return typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u); }

  /**
   * QIR's notes for a show (/api/plugins/qir/notes?show=, keyed by episode id) added to its
   * episodes, as the site does it (plugins/discovery/public/main.js enrich): the headline becomes
   * the title and the summary the description only where the station's feed has none; the
   * transcript id is kept. A pending note (QIR has not processed it) adds nothing. Safe to run
   * twice. Returns how many episodes gained a transcript.
   */
  function applyNotes(show, notes) {
    var n = 0;
    if (!show || !notes || typeof notes !== 'object') return 0;
    show.episodes.forEach(function (e) {
      var q = Object.prototype.hasOwnProperty.call(notes, e.id) ? notes[e.id] : null;
      if (!q || q.pending || typeof q.qir !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(q.qir)) return;
      e.transcriptId = q.qir;
      var headline = String(q.headline || '').trim();
      if (!e.hasTopic && headline && headline.length <= TOPIC_MAX) { e.title = headline; e.hasTopic = true; }
      if (!e.description && q.summary) e.description = String(q.summary);
      n++;
    });
    return n;
  }

  return {
    THEMES: THEMES, EPISODE_SORTS: EPISODE_SORTS, SHOW_ORDERS: SHOW_ORDERS, EPISODE_LIMITS: EPISODE_LIMITS,
    ACCENT_PRESETS: ACCENT_PRESETS, THEME_BACKGROUND: THEME_BACKGROUND, DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    TITLE_MAX: TITLE_MAX, BOOLEAN_KEYS: BOOLEAN_KEYS,
    normalizeHex: normalizeHex, parseEmbedOptions: parseEmbedOptions, embedQuery: embedQuery,
    iframeCode: iframeCode, textOn: textOn, luminance: luminance,
    orderShows: orderShows, episodesToShow: episodesToShow,
    formatTime: formatTime, formatLength: formatLength, formatAirDate: formatAirDate,
    showsFromArchive: showsFromArchive, applyNotes: applyNotes
  };
});
