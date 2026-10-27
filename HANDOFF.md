# HANDOFF — KPFK Archive

**Updated:** 2026-10-27 (INT-974 fixes: episode counts, re-runs, name tiles — committed, not deployed; first section). Previously 2026-10-25 (transcripts and headlines: QIR outage handling, 5-minute self-refresh, timed problem record, DNS cache — all **live and checked**; see the first two sections and [docs/transcripts.md](docs/transcripts.md)). Previously 2026-10-15 (site audit and fixes, all **live and checked** — first section; Paul tested on desktop and iPhone: "fixes and features work great"; overview PDF for Pacifica in `docs/overview/`). Previously 2026-10-14 (from the Flutter app session: share-link previews name the episode — uncommitted here, see the first section; app/web differences; integration ideas). Previously 2026-10-01 (The Aware Show withheld, live: remind item 8; Flutter app caught up: see "Open work from the Flutter app"). Previously 2026-09-30 (repo moved to `pacifica-foundation`; Discovery app stopped; Coolify email). Previously 2026-09-29 (archive rules, /discover retired, Import / Export + master spreadsheet).  **This folder is the active KPFK podcast-template project.**
WBAI (`/Users/paulhenshaw/Desktop/wbai-archive`) is maintenance-only from here on.

Read this, then [CLAUDE.md](CLAUDE.md) (working rules), then
[docs/README.md](docs/README.md) (which docs are current vs inherited from WBAI).

## 2026-10-27 — INT-974 (small fixes from Ace's review): counts, re-runs, stand-in art

Committed, **not yet pushed or deployed** (check `git log origin/main..main`). Offline suite green.
- **Episode counts (Nader 9 vs 8):** the quiet background update redrew Just aired only; an open
  show sheet or Now Playing kept the old list (the Live popup repaints every 15 s, so it moved
  on and the two disagreed). Both refresh paths now call `repaintFromRows()` (`public/app.js`),
  which also fires `archive:rows` for Now Playing. Browser test `test/homepage/new-episode.cjs`
  (8091): 9/9; 3 fail on the old code.
- **Name tiles:** 25 shows carry Confessor's stand-in `KPFK_med.jpg`. Station `placeholderArt`
  names it; such shows (and ones with no picture) get `tile` → `/api/artwork/tile/<show key>`
  (SVG, category colour via `?c=`). The web page swaps it in (`useTile`); `photo` is unchanged
  for the Flutter app (no SVG). Real art in Confessor removes the tile. Test `name-tile.test.js`.
- **Re-runs:** found from QIR transcripts (`plugins/discovery/lib/qir/repeats.js`): one transcript
  read every 4 s in the background (backfill ~1.5 h after deploy, then new episodes only),
  fingerprints saved in `DATA_DIR/discovery/repeats.json`. Same show, ≥60% shared 8-word runs,
  lengths within 20%. Measured on 912 real pairs: re-runs 73–95%, different ≤28%, Law and
  Disorder fund-drive overlap ~47%. Later airings hidden; the first shows "Also aired …"; links to
  a hidden airing open the first. Paul's calls: collapse, and Democracy Now's same-day 4 pm
  repeat counts. On the 147 sampled transcripts it hides 16, incl. Nader Oct 4 (→ Sep 27) and
  **Oct 25 (→ Oct 18, different QIR headline)**. Tests: `repeats.test.js`, `reruns.test.js`.
  **Not verified end to end locally** (no QIR key here). After deploy: `/healthz` →
  `discovery.reruns` (fingerprinted climbs to ~episodes) and `archiveFilter.repeats`; studio
  Feed anomalies lists each as "Re-run".
- **Start-up crash after the first push (fixed, live 2026-10-27):** 3de07f8 made start-up code read
  `showInfo` before its `var` ran; the page died. Fix c3a9465 (declared with `rows`). New check
  **`test/page-load/run.sh`** (own server + muted Chrome; 10 page loads + a name tile): run before
  every push touching `public/` (CLAUDE.md §6). Fails 11/11 on 3de07f8.
- Senderos de Oaxaca's host field: fixed in Confessor by Paul (2026-10-27). Was: Senderos de Oaxaca's host field holds description text ("Alternating with La
  Plomada; …") — Confessor fix (Paul). Empty hosts were already left out.

## 2026-10-25 — QIR list refreshes on its own; timed problem record in status

- **What happened:** in the morning about 7 recent shows had no headline until a few clicks later.
  Our QIR episode list refreshed only when a visitor's request asked, and that visitor got the old
  copy. Now a 5-minute timer keeps it (and the notes) current with no visitors.
- `/api/plugins/qir/status` → `recent`: the last 20 QIR problems and recoveries with times. Read
  that first; no Coolify log digging. Full write-up: [docs/transcripts.md](docs/transcripts.md).
- Tests in `plugins/discovery/test/qir.test.js` and `server.test.js`, all shown to fail on the old code.
- **Live and checked 14:23 UTC** (`ee78acc`, ticks every 5 min confirmed). **Recheck `recent` next
  session:** two short `fetch failed` blips on 2026-10-25 (13:44, 14:37–14:42 UTC) — our server
  could not reach QIR for a few minutes; transcripts kept loading. **Cause found (14:51 blip):
  `EAI_AGAIN`, our container's DNS, not QIR.** Code fix: `lib/dns-cache.js` (all outbound requests;
  `/healthz` → `dns`). Server fix recommended in docs/DEPLOYMENT.md "DNS" (Paul: Cloudflare across
  all apps later). Next session: check `/healthz` `dns.servedStale` / `failed`.

## 2026-10-23 (evening) — open pages follow deploys (not yet pushed)

- **What happened:** after the "easy wins" deploy, Transcript did nothing for Paul on desktop and
  iPhone. Console: `Cannot read properties of undefined (reading 'transcriptNote')`. His browser had
  the new `along.js` with an old `/station.js` (no `copy`); a fresh load was fine. A page left open,
  or loaded while Coolify ran old and new side by side, can mix builds. Listeners won't know to reload.
- **`public/update.js`:** the page knows its build (`<meta name="app-version">`) and its settings
  file's build (`window.AppBuild` in `/station.js`), and asks `/api/version` (tiny, no-store) when the
  listener comes back to the page, every 5 min on screen, and when the network returns. Different →
  reloads **only** when the listener is arriving and nothing plays; otherwise a banner ("A new version
  of the site is ready. Reload", z-index 305: over popups, under the bar) and a reload on the next
  return. Never under playing audio, never in the background (lock-screen controls). One automatic
  reload per target build per 2 min, then the banner (no loop when two servers answer).
- **`appVersion()` now covers every file the page loads** (rendered page, every stamped link,
  plugin scripts, settings). It used to miss 12 of 16 — a Transcript-only or Now Playing-only deploy
  left `/healthz` `version` unchanged. The format's first four parts are unchanged.
- `along.js` shows a transcript without the station's line when the settings file is old, rather than
  throwing. `ArchiveApp.soundOn()` is new (playing or starting, episode or live).
- Tests: `test/pacifica/app-version.test.js` (every linked file changes the build; shown to fail on the
  old formula), `test/homepage/update.cjs` (19 checks, fake deploy in the browser, real tab switch;
  9 fail on the old code, including Paul's exact error).
- **Fixed 2026-10-24 — live and checked** (status shows `cause`; Paul: "fix worked"). Full write-up of
  this and every earlier transcript breakage: [docs/transcripts.md](docs/transcripts.md). Live, "The transcript service is unavailable"
  came and went. QIR's hourly catalog refresh had been failing since ~21:22 UTC (last success 20:22),
  and every failure set a 30 s cooldown in `request()` that refused **all** QIR calls, transcripts
  included. Now the cooldown pauses only the background refresh; a transcript always goes to QIR,
  and a failed transcript never blocks others. The cause (route + HTTP status / timeout) is logged
  (`[qir] request failed — …`) and shown as `cause` in `/api/plugins/qir/status`. **After deploy,
  read `cause`** to learn why QIR's listing refresh fails (no key locally). Test: `qir.test.js`
  "a failing background refresh … never refuses a listener's transcript" (fails on the old code).

## 2026-10-23 — Ace's review: easy wins (first commit live 2026-10-23; /schedule pushed after)

Ace's review doc: "Podcast App Feedback (KPFK, for Paul)" (Google Doc, reviewed 2026-10-11/12).
Done, offline tests 204/204, not yet checked in a browser:
- **"Podcasts", not "Archive"** in everything a listener reads: header ("90.7 FM · Podcasts"), page
  title, share cards (server `ogDefaultTitle`), install name (manifest), status lines.
- **Station `copy` block** (optional, `lib/station-config.js`): `heroDesc` (home paragraph) and
  `transcriptNote` (default "Machine transcript. Names and words may be wrong." — no "from QIR").
- **Menu**: every link that leaves the app has the new-tab mark; Schedule/Donate/Privacy (in-app) don't.
  The kpfk.org item now has a home icon.
- **Doubled "feat."**: the playlist log sometimes writes "Pains of Love (feat. Majee) feat. Majee"
  (4 of 149 recent cue files). `PlainText.songTitle()` drops the repeat, in cue playlists and the
  live song line (`normalize.js` — reaches `/api/now-playing`; harmless for the Flutter app).
- Tests: `test/pacifica/listener-copy.test.js`, additions to `menu.test.js`, `normalize.test.js`,
  `plugins/discovery/test/playlist.test.js` — all shown to fail on the old code.
- **`/schedule` link** (INT-969, part; same day, second commit): arriving opens the schedule over the
  home page (Back/close land on the page, on the site); opening it puts `/schedule` in the address bar;
  its own share card; the menu's Schedule item links there instead of kpfk.org's (Aiir) page. Rule in
  `public/links.js` (`isSchedule`). Browser test `test/homepage/schedule-link.cjs` (8091): 15/15, and
  fails on the old code (no schedule; Back left the site). `/live` is reserved for the Listen Live page.
  Live and checked by Paul.
- **`/grid` link** (third commit, Paul's ask): the week grid over the schedule; Back steps grid → schedule
  → page; the Grid button shows `/grid`; below 1024px it opens the schedule at `/schedule` (grid is never
  on phones). Same test file: 27/27; the `/grid` checks fail on the previous commit.
- **`/live` link, quick version** (fourth commit, Paul's call: quick now, the real page next): opens the
  existing Live popup over the home page; the On Air button shows `/live`; Past episodes → show → Back
  returns to `/live`. Still one tap to play (no autoplay attempt; live audio untouched). The Listen Live
  page (INT-966) takes this address over. Test `test/homepage/live-link.cjs`: 19/19, fails on the old code.
- **Next up — Listen Live build, in 5 phases** ([docs/kpfk/listen-live-plan.md](docs/kpfk/listen-live-plan.md) §6):
  1 station Contact + Wording settings (file and studio) → 2 the `/live` page → 3 footer → 4 fund drive
  (studio switch) → 5 schedule finish. Mockup approved (private, not shared with Ace):
  https://claude.ai/artifact/725PpZY5mGgTEDUwpT7NC1. Tracker: INT-966/967/968/969 carry the phases.
  Waiting on Ace: studio email, WhatsApp number, fund drive embed, Making Contact MP3.
- Not reproduced: Ace's Nader 9 vs 8 episode count — both views count with `episodesFor()` on the
  same rows; likely two moments/tabs. Needs a live repro.
- Bigger items from the doc (Listen Live page, fund drive module, footer, schedule URL, schedule card
  buttons, search grouping/ranking, chapters) are not started.

## 2026-10-15 — site audit: layout and play fixes (live and checked)

**Live 2026-10-15** (Paul's last redeploy that evening, GitHub at `6280446` — includes the focus-ring fix
`abfb3cc`): version `45f9d-mv9t1o7c…`, `instanceId` `73039ae5…`
unchanged, `freshVolume:false`; live `app.js` carries the iPhone race fix. Share previews checked live:
`BASE=https://podcasts.kpfk.org node test/share/og-tests.js` **23/23**, including the QIR-headline check
(section 3 fixed the same day: it sent a WBAI-era forwarded host, which Coolify's proxy rightly
replaces). Paul tested on desktop and iPhone: "fixes and features work great".

Click-through audit in Chrome **and WebKit** (Playwright from the session scratchpad, not a
repo dependency) at 390/768/1280, light and dark, scratch server 8091. Working well: playback,
player bar always visible and uncovered, Escape/Back always close the top layer and stay on the
site, no page errors, no sideways scroll. Fixed (Paul approved):

- **Search cards crushed on phones** (title 24px wide at 360): `.search-copy` `flex:1` started at
  zero width so the "View show" button never wrapped. Phone rule gives it a flex-basis.
- **"…" lines outgrowing column-flex buttons, iPhone only**: Safari keeps `<button>`'s default
  `align-items:flex-start` (current desktop Chrome dropped it). Player subtitle ran under the Songs
  button; 21/111 week-grid host names cut mid-letter. `.player-info`, `.grid-block` → `stretch`.
- **No blur on older iPhones**: six rules had `backdrop-filter` without `-webkit-` (header,
  player bar, to-top, studio dialog, two in the Discovery plugin CSS).
- **Refused play spun forever**: a refused `play()` fires neither `error` nor `pause`, so
  "Loading…" never cleared and nothing was logged. All five archive play sites now use
  `playArchive()` (`public/app.js`): AbortError ignored, refusals logged, "Tap play to start".
- Dotted detail lines broke before the dot ("· 60 min") or inside a part ("5:00 / am",
  "Oct / 14"): `dots()` in `app.js` (Just aired, search titles and details, sheet tally) keeps
  later parts whole; the first part (a title) still wraps between words.
- Touch targets: search clear 22→32px (same 22px circle), show-view episode rows 16→40px tall.
- Tests: `test/homepage/layout-fit.cjs` (browser, 8091; reproduces Safari's button default;
  WCAG 2.5.8 with its spacing and equivalent-control exceptions) and
  `test/pacifica/css-prefixes.test.js` (offline). Both shown to fail on the old code.
- Feed: Thom Hartmann's DJ field fixed by Paul in Confessor (he has access). "espa~nol" is the
  only text glitch in 1,189 episodes — note for Otis, no display rule.
- **Later the same day (Paul, from his iPhone):** the player bar's Transcript button "did not
  work" with a popup open. Root cause: the bar sits above every popup (z 310) so the button
  stays tappable, but Listen along is layered under popups (z 90) — it opened invisibly under
  the show sheet, episode, Now Playing, schedule, menu, Donate or artwork zoom. New
  `ArchiveApp.closePopups(then)` closes popups top-first through their own close paths (history
  stays right), then opens the panel; the sheet's Transcript button uses it too. Test:
  `test/homepage/listen-along-popups.cjs` (23 failures on the old code, 52/52 now; also checked
  in WebKit). And the episode action row is one height (desktop 32px, touch 44px): Play and
  Share stood taller than the Transcript / Songs pills.
- **Evening, still broken on Paul's iPhone only** (player → Now Playing → Transcript): a timing
  race. Closing Now Playing steps back through history; the next layer opened after a fixed
  60ms (`closeThen`) — on an iPhone the Back landed later and its popstate closed the panel (and
  Now Playing → Episodes lost the show sheet the same way). `closePopups` had the same flaw
  (80ms). Now close functions return true when they step through history and `closePopups`
  waits for that popstate (`afterPopstate`, 1.5s backstop); Now Playing's `closeThen` uses it.
  Reproduced on live with history held 300ms; test section "slow phone" in
  `listen-along-popups.cjs`.
- **Paul's calls, same evening:** popups are **one at a time** (a new kind of layer replaces
  the open one; show → episode stays in one sheet; only the artwork zoom and schedule → show
  stack; Back undoes one step). **"Songs" is now "Playlist"** everywhere a listener sees it —
  "Transcript" untouched (Paul: do not touch it). Find arrows show only once a search has
  matches. **A− / A+ text size** in the Listen along panel, as in the Flutter app
  (0.9/1/1.2/1.45, phones skip the smallest, remembered per device).
- **Overview PDF for Pacifica's ED and staff:** [docs/overview/](docs/overview/README.md) →
  `KPFK-Archive-Website-Overview.pdf` (9 pages — later the same day Paul added the schedule list beside
  the grid and a plain "What makes it dynamic" page on the automatic headlines, summaries and
  time-marked transcripts; 16 screenshots: listener pages from the live site at
  phone / tablet / computer sizes, light and dark mixed, week grid included; **the studio** — sign-in,
  dashboard, Import / Export, printable report — at computer size from a scratch copy with example
  figures). Same layout and fonts as the app's overview. Paul: "The PDF is great!" Regenerate steps in
  its README (`capture.cjs`, `capture-studio.cjs`).
- **Fixed (live 2026-10-15): focus ring on arrival from a link.** A show or episode opened from a link drew the close
  button's ring (no tap or key yet, so no input mode; the page moves focus there). `theme-boot.js` now
  starts in "pointer" mode; the first key press brings rings back. `test/homepage/focus-rings.cjs`
  gained the link case (focus emulated — a headless page has no window focus); fails on the old code.
- Not done: the 16 WBAI-era comments in `app.js` describe inherited code that may be dead on KPFK
  (wbai.org program directory, schedule "ghost" filter) — tidy when touching those areas.

## 2026-10-14 — from the Flutter app session (read before working here)

A long session in `kpfk-podcast` touched this site. **Done: committed (`b5943f8`), deployed and checked
live 2026-10-15 (23/23, see the 2026-10-15 section).** What changed:

| File | Change |
|---|---|
| `server.js` | `episodeOg(row, info)`: a shared **episode** link's preview tags name the episode — `og:title` = "<episode title> — <show>" (station topic via `archive-search.js` `episodeTitle`, else QIR's headline; neither → the show's name, as before), `og:description` = QIR's summary, else the show's description. Applies to `?show=<id>` and to permanent `/show/<code>/<episode>` links. Artwork unchanged (square show art, `summary` card). `OgSearch = require('./public/archive-search')` at the top. |
| `plugins/discovery/index.js` | `noteFor(id)`: one episode's QIR note, synchronous, from the last `archiveNotes()` build (null + starts a build when cold; null for pending/disabled). `warm()` now also builds the notes, so the first preview after a restart already names the episode. |
| `test/share/og-tests.js` | Section 1 expects the episode title, with a station-topic check and a QIR-headline check (QIR's skips locally — no key off Coolify). Section 4 no longer hard-codes **WBAI**'s card (it failed on KPFK since the fork): reads `stations/<id>.json`. |

Verified 2026-10-14: `npm test` 198/198; local 8081 `BASE=http://localhost:8081 node test/share/og-tests.js` 23/23; the
station-topic check **failed on the old server code** ("BradCast w/ Brad Friedman") and passes on the new
("Courts; Corruption; Environment — BradCast w/ Brad Friedman"). **(Done 2026-10-15.)** Was: commit, push, **Coolify
redeploy** (push is not deploy, §4), then `BASE=https://podcast.kpfk.org node test/share/og-tests.js` — the
QIR-headline check runs only there, and it matters: only 95 of 1,175 episodes have a station topic, the
rest are named by QIR. Then refresh a link in the Facebook Sharing Debugger / LinkedIn Post Inspector
(they cache cards).

**What the app now relies on from this site** (breaking these breaks the shipped app):
- **The share link**: every Share button in the app sends the bare link
  `https://podcast.kpfk.org/?show=<archive episode id>` (`KpfkRepository.shareUrl`) — no text, so
  Messages/WhatsApp/Slack/X/Facebook build a card from **this page's OG tags**. Keep `?show=<id>` resolving
  and its tags correct; an episode that ages out falls back to the station card (section 4 of og-tests).
  Email clients show the bare URL (no cards in email; share_plus drops the subject on link shares).
- Unchanged: `/api/archive`, `/api/plugins/qir/{status,notes,transcript/<qir>}`, the `notes` ETag, transcript
  404 vs 5xx — APP-FAMILY.md.

**Where the app now differs from this site** (decide whether the web follows — Paul's calls):
- **Hosts**: the app shows "with <host>" on the show header, player, transcript About and Following cards,
  taking the **station's `dj` first** and QIR's host only when the station lists none (QIR misspells:
  "Tom Hartman", "Kip Brooks"). This site does the reverse (`r.host || info.dj`, `public/app.js` ~899, 4698,
  4757). Recorded as a deliberate difference in kpfk-podcast `CLAUDE.md` §4f / `docs/APP-PLAN.md`.
- **Transcript label**: the app says "Automatic transcript — names and words may be wrong." (no service
  name: "QIR" is getting a product name, not yet chosen). This site still says "Machine transcript from
  QIR — …" (`plugins/discovery/public/along.js:216`).
- **Transcript text size**: the app has A− / A+ (sm/md/lg/xl = 0.9/1/1.2/1.45, the Pacifica playlists
  player's `live.textSize`; phones skip sm). **Done here 2026-10-15** (same steps).
- **Find arrows**: the app shows ↑/↓ only when there are matches. **Done here 2026-10-15.**
- **"Songs" → "Playlist"** on this site (Paul, 2026-10-15). The app may still say "Songs" — Paul's call
  whether the app follows.
- Smaller, app-only: outlined cards, tablet scaling, follows (device-only, no account), message modals.

**Feed text seen 2026-10-14:** Informativo Pacifica's show description arrives as "Daily Spanish language
newscast - noticiero diario en espa~nol" — a literal `~n` for "ñ" in the upstream text (app and website
both show it). A feed fix for Otis (app CLAUDE.md §3), or a display rule here if it is common — check
other descriptions in the audit.

**Integration ideas to explore next** (Paul, 2026-10-14: "explore more ways to integrate"):
1. **Links that open the app** (kpfk-podcast APP-PLAN Phase 5): serve `/.well-known/apple-app-site-association`
   and `/.well-known/assetlinks.json` from this site; the app adds Associated Domains / an intent filter.
   A shared `?show=` link then opens the episode in the app when installed, the web page otherwise.
2. **Smart App Banner** on this site once the App Store listing is live:
   `<meta name="apple-itunes-app" content="app-id=6814673167, app-argument=<the page URL>">` (Safari shows
   "Open in KPFK Podcasts"); a matching "Get the app" link for Android once Play is public.
3. **Permanent links in shares**: the app shares `?show=<id>`; `/show/<code>/<episode>` (`public/links.js`)
   survives the episode rotating out (falls back to the show). Consider having `/api/archive` expose the
   permanent path per row so the app can share it.
4. **Designed share image** (app "level 3", future): could instead be an `og:image` this server renders per
   episode (art + title + host), so every share — app or web — gets a large card.
5. **"New on KPFK"** (APP-PLAN Phase 4): the app's refresh pill wants a cheap "what changed" signal from
   `/api/archive` (head count or generation id) rather than a full fetch.
6. Shared design tokens: the app's `kpfk_theme.dart` copies `styles.css`; the app added `card`/`cardEdge`
   (dark cards one surface step up, 28% edge) — worth adopting here or recording as app-only.

## Open work from the Flutter app (2026-10-01) — not a reminder; pick up when working here

- **QIR headline for paragraph topics** (Paul decided yes; the app does it): 53 Talk episodes have a
  pasted paragraph as topic and show "Show — date" here, while the app shows QIR's headline. Change
  `enrich` in `plugins/discovery/public/main.js` — exact change in `kpfk-podcast/docs/APP-PLAN.md` (renamed from WEB-FEATURES-PLAN.md 2026-10-14)
  "Decisions" #0 — and port the app's test into `plugins/discovery/test/main-enrich.test.js`.
- **Contracts the app relies on** (APP-FAMILY.md): QIR `status` states (404 / `switched_off` /
  `disabled` / `not_configured` = off; `ready` = fetch; anything else = temporary — renaming one breaks
  the app); `notes` ETag stable (hash of the body); transcript 404 = "none yet" vs 5xx = "try again".

## Remind Paul first (say these at the start of every session)

1. **Next session first (2026-10-25):** read `curl -s https://podcast.kpfk.org/healthz` → `dns`
   (`servedStale` = DNS failures the cache covered, `failed` = ones it couldn't) and
   `/api/plugins/qir/status` → `recent`. Live at 17:23 UTC with `failed` 1 (confessor.kpfk.org, first
   lookup after boot). Open options: the one-line Coolify DNS setting (docs/DEPLOYMENT.md "DNS"; Paul
   is waiting for the Cloudflare rollout), and "use the saved answer at once, check DNS in the
   background" to remove the ~5 s wait on a failing lookup (Paul: test later first).
   **Live and checked (2026-10-15):** everything below is deployed (last: the 2026-10-15 audit fixes,
   iPhone transcript race, Playlist, A−/A+, share previews, focus ring on links — version `45f9d-mv9t1o7c…`); `storage.instanceId` =
   `73039ae5-6589-4ec2-9df5-354de84c0989`, `freshVolume:false`. Player settled (floating card — do not
   re-raise). podcasts.kpfk.org and podcast.kpfk.org are the same app.
2. **Ace / QIR:** email sent 2026-09-28. As of 2026-09-29 the 7 show keys (All Of The Above, Nightscapes,
   The Aware Show, Reggae Central, CodePINK, Making Contact, CinemaScore) and World Massive Sep 26 are
   still not processed in QIR. **Any reply?** Recheck with the live `/api/plugins/qir/catalog`.
   **New 2026-09-30 (after Ace's QIR changes):** QIR stopped processing at ~16:05 PT (last done:
   Lawyers Guild 15:00). Democracy Now 16:00, Background Briefing 17:00, Evening News 18:00 are in
   QIR with no headline/summary (`updated_at` empty); Pacifica mp3s are full and on time; our
   plugin reported `pending` 3, `behindHours` 3.2. Nothing wrong on our side. **Paul's call: no
   email yet** (Ace is busy; not in release). **Rechecked 2026-10-01: caught up** — `pending` 0,
   `behindHours` 0; those three shows and the overnight hours have headlines. No note to Ace needed.
   The 7 show keys / World Massive item above was not rechecked, except **The Aware Show: QIR has
   processed all 16 episodes (checked 2026-10-01)** — now withheld by us, see item 8.
3. **Step 8 done (checked 2026-09-30):** the old Discovery app is **stopped** in Coolify — no
   container running, kpfk-discovery.pacifica.audio returns `503`. The app, its volume and the
   address are kept as a future staging app (own named volume, never production's; see the
   Discovery repo's HANDOFF item 0). **Next:** 5b: station template in the studio
   (anyone with the studio login edits feeds, logo, colours, text; placeholders already in
   Discovery & settings → Station & appearance). A moved site needs its QIR key set in Coolify (env).
4. **Auto mode outage (Anthropic, since 2026-09-28 ~06:30 UTC):** "server-side auto mode classifier gave
   no verdict" blocks commands in bursts, for everyone ([#97870](https://github.com/anthropics/claude-code/issues/97870)).
   Not this project. Paul chose to stay on auto; when it bursts, wait or switch to "Edit automatically".
   Allow lists do not help in auto mode during the outage. Claude may not edit its own permissions.
5. **Parked:** desktop "Copy link" share button; Coolify "Instance's Domain"
   (Coolify email itself works since 2026-09-30, via Resend — server manual `docs/07-operations.md`); queued Ace items
   in the Discovery HANDOFF (hold). Known stale self-test: `test/studio/layout-tests.js` "with both
   defences removed…" fails on 2026-09-28 code too (real layout checks pass).
6. **How Paul works:** short plain wrap-ups + "Paul — your action points"; copy-paste text on a
   page with Copy buttons; ask before opening a browser or touching his app on port 8081;
   announce every push. Root causes, not workarounds ("no duct tape").
7. **Flutter app (2026-10-01):** audit + phased plan for bringing this app's features (QIR notes,
   transcripts, search, links) to the phone app is in `~/Desktop/kpfk-podcast/docs/APP-PLAN.md`.
   Do that work in a session opened in the kpfk-podcast folder. Its step **W1** (a small
   `/api/plugins/qir/notes` route for apps) is done here, in kpfk-archive.
8. **The Aware Show withheld (2026-10-01, live and checked the same day):** KPFK has no on-demand rights to it.
   New profile list `withheldShows: ["aware"]` in `stations/kpfk.json`: no card, episode, search
   hit, QIR text or transcript in `/api/archive` or Discovery (so the Flutter app loses it too).
   The live schedule still lists its slot, with nothing to play. `/healthz` →
   `archiveFilter.withheld` (live: 16 episodes; 0 Aware in archive, Discovery catalog and qir/notes).
   **Future dev — suppress from the studio:** today withholding a show is a profile edit +
   redeploy. Build a studio panel to suppress a **show or a single episode** (rights, legal,
   a bad recording) without a deploy: stored on the data volume, with a reason and date, listed
   in the anomaly report, undoable. Same filter point (`scheduledView` + Discovery `withPending`).
   **Audit 2026-10-01 — where Aware comes from (deal with later):**
   - Pacifica's JSON has **no field** that marks a show as not for the archive. Every show record
     has the same 15 fields; every episode the same 11. The only per-show archive setting is
     `expires`, the archive lifetime Confessor sets (music 14 days, most talk 60, some 80–90).
     Aware has the ordinary 60.
   - Paul understood Aware was turned off in Confessor. **Checked 2026-10-01 13:00 PT, not yet
     visible:** catalog (updated 13:00 PT) still has the show record and 16 episodes, newest
     Sep 30 13:00 (`kpfk_260930_130000aware.mp3`, public on archive.kpfk.org); the published
     schedule still has Aware Wed + Thu 13:00 PT through Oct 15. Recheck after Oct 1 / Oct 7.
   - **QIR** reads Pacifica itself (our app only GETs from QIR) and has processed **all 16** Aware
     episodes, Sep 30 included. Our `withheldShows` cannot save QIR's compute.
   - Flutter app reads our `/api/archive` + `qir/notes` (checked `kpfk_repository.dart`), so our
     block covers it.
   - **Best place, in order:** (1) Confessor stops recording/publishing Aware — ideally a per-show
     "don't archive" setting beside `expires`, useful to every Pacifica station; that stops the mp3s,
     the feed, QIR and every app at once. (2) QIR skips `aware` (and drops its 16 transcripts) until
     then. (3) Our `withheldShows` stays as the station's own override; harmless once upstream drops it.
   - **Note to Ace sent 2026-10-01 (Paul):** Aware is off the podcast site; still in Pacifica's feed
     and schedule, and processed by QIR — QIR could skip show key `aware`. No reply yet.
   - **Next week:** recheck whether Aware has left the feed and schedule, and whether QIR has
     stopped processing it. Our live `/api/plugins/qir/catalog` hides Aware now, so it cannot
     answer that; Pacifica's feed (`archive.kpfk.org/fe_feed/fe_catalog_kpfk.json`) answers the
     first, Ace the second.
   - Code: `lib/station-config.js` (validation), `lib/pacifica/service.js` `scheduledView`,
     `plugins/discovery/index.js` (`withPending`, transcript route), `server.js` coverage export.
     Tests: `service.test.js` "withheld shows", `discovery-profile.test.js`, Discovery `notes.test.js`.
     Every listener route reads the filtered archive (`episodeRecords()` ← `peekArchive()`); only
     studio exports read the unfiltered catalog (audited 2026-10-01).

## 2026-10-13 — studio tabs as cards; studio days in LA time; one catch for every request (live and checked)

- **Tabs** (Paul: "Discovery & settings gets totally lost"): two equal cards with icon, title and a
  line saying what is inside; the open one has an accent border and tint. Arrow keys move between
  tabs (`role="tablist"`). Browser check: `test/studio/layout-tests.js` 1b (clicks + arrow keys).
- **Data sources stay read-only (Paul's call, 2026-10-13).** An in-studio editor was built and then
  dropped as over-engineered: each station is its own deployment, so its feeds are set by hand in
  its station file when the app is duplicated. Notes: [docs/data-sources-plan.md](docs/data-sources-plan.md).
- **Studio days are now Los Angeles days (bug fix, Paul saw "10-14" on the 13th).** Usage counters,
  the 30-day chart, archive-per-day, export spans and file names used UTC days, so from 5 pm PT
  everything was filed under tomorrow (and on a month's last evening, next month's file).
  `localDay()` in `server.js` uses the station `timezone`. **Stats stored before the deploy stay on
  UTC days** (daily totals cannot be re-split); the deploy evening splits across two dates once.
  Listening export column `date_utc` → **`date`**, manifest `from_date`/`to_date` (Paul's call);
  read-mes say days before mid-October 2026 are UTC days. Test: `test/pacifica/station-day.test.js`
  (fixed-clock server, 8 pm PT and Oct 31 11:30 pm PT), shown to fail on the UTC code.
- **One route's error no longer stops the server.** The handler's try/catch began after the POSTs,
  studio, exports and backups; an error there was an unhandled rejection and Node exited (seen
  tonight when a half-done export edit threw). Now `handleRequest` runs inside one catch: full stack
  logged as `[error] unhandled in <METHOD> <path>`, that request gets 500 (or is cut off if already
  streaming), everyone else keeps being served. Test: `test/pacifica/request-errors.test.js`.

## 2026-09-29 — archive rules, /discover retired, Import / Export for moving the site

All pushed and live (Paul redeployed; each checked on podcasts.kpfk.org). `npm test` 186/186.

| Commit | What |
|---|---|
| `e1ff67e` | Archive list applies the station rules Discovery already had: **music 14-day limit** (category Music or `musicShows`; not the feed's episode type, which marks talk like Something's Happening as Music) and **episode corrections** (three Alan Watts hours filed as On Contact now show as Alan Watts). Reaches the Flutter app via `/api/archive`. The 8:00/8:30 halves are not joined here |
| `c93ea94` | Old standalone `/discover` page retired: 302 to the main page (search kept), "Discover shows" menu link removed. `/discover/<file>` assets stay (the main page loads them). `/discovery` was never a route — any unknown path shows the home page |
| `9bd53c2` | Studio **Import / Export** (was "Export"): 1. Back up or move this site, 2. Stats for Pacifica and the station. **Bug fixed:** the backup dropped feature clicks and restore refused them — the day fields were listed twice (server, backup); now one list, `lib/usage-fields.js`. New `features` table; zip writer `lib/export/zip.js` |
| `e490723` | File lists always shown, never folded (Paul: hidden content is bad UI) |
| `ee69216` | Backup carries the **Discovery switches** (`settings.discovery = {enabled, qir}`); restore previews, sets, and undo puts them back. The site writes only stats, the switches and its own identity (never moved) |
| `e74c551` | **Download everything (.zip)**: every dataset (stats, archive, coverage, profile) + `features_daily` + README-FIRST |
| `dfa4132` | Printable report gains **Feature use** |
| `192a62c` | Studio: **Discovery & settings no longer shows the stats**. Root cause: `.studio-main {display:grid}` beat `[hidden]`; one global `[hidden] {display:none !important}` replaces four one-off patches. Browser test in `test/studio/layout-tests.js` 1b (not yet run — needs Chrome). Listener stylesheets use 31 per-element `[hidden]` rules: same pattern, nothing broken, not swept |
| `ea9f3cb`, `ea69217` | Profile `siteUrl` + `retiredHosts` (a retired host 301s to the same path on siteUrl). KPFK retires **no** host: the old Discovery address is kept for staging |
| `077aee0` | **Master spreadsheet (.xlsx)**: every table, one tab each, plus Read me and Columns tabs (`lib/export/xlsx.js`, no dependency; opened with openpyxl on real data) |

**Move test (Paul, 2026-09-29):** live full backup restored onto a fresh local server — every
listening figure, all 8 feature counters and (after its audio check caught up) the archive filters
identical. A fresh server checks audio 400 files per archive load, so it needs a few visits; Discovery
switches now travel with the backup.

## 2026-09-28 — one app: Discovery moved into the podcast site (read this first)

**Plan and status live in [docs/INTEGRATION-PLAN.md](docs/INTEGRATION-PLAN.md)** — at-a-glance table,
"Start here tomorrow", how to check. Identical copy in `kpfk-discovery-plugin/docs/`.

- Done today: steps 1–3, 4a–4e, 5a, 6 (32 commits, all pushed; `npm test` 182/182).
- Next session, in order: music 14-day limit here → episode corrections here (Alan Watts) → 4f →
  redirect and stop the Discovery deployment. Then 5b, 7, 8.
- Player: done and live (floating card). Not an open decision.
- Ace (checked 2026-09-28): the 7 show keys and World Massive Sep 26 are still not fixed in QIR.
  Follow-up email sent 2026-09-28.
- Checks: popup audit `tools/popup-audit/` (Chrome on port 9333); stats counters proven by
  `test/pacifica/ui-counters.test.js`.

## 2026-09-26 — off-schedule programs; QIR stalled; three apps, one feed

**27 Sept:** schedule/channels skip one bad entry (`a2327d6`); **studio "Feed anomalies"**
section (`/api/studio/anomalies`, `anomalies()` in `lib/pacifica/service.js`): 15 items on the
live feed today (3 failed recordings, 4 durations, 1 held, 7 show types), "Copy as text".
`npm test` 94/94; checked in Chrome at 1280 px, no errors.

**Evening: QIR outage resolved by Ace; all of the below is live** (Paul redeployed `032702b`).
Vision and rules: [docs/APP-FAMILY.md](docs/APP-FAMILY.md) — QIR is Ace's service; Discovery is
the plugin; this app works on the Pacifica feed alone and shows Discovery where it is switched on.

New shared doc **[docs/APP-FAMILY.md](docs/APP-FAMILY.md)** (identical in the Discovery and
Flutter repos): which app reads what, how off-schedule uploads (`2kpfk`) differ, today's
incident and action items. Read it before touching feed parsing or `/api/archive`.

- **This app was fine today.** The Pacifica feed is well-formed; `/healthz` ready, not stale.
- **Discovery's Just aired froze** because QIR (Ace) stopped taking in new episodes at
  ~02:00 PT. Root cause: consumers (QIR and our apps) weren't parsing the special /
  off-schedule shows correctly — the Pacifica feed was right; Otis needs to do nothing.
- **Fixed the same day:** `normalizeCatalog()` used to fail the whole catalog on one bad
  record (freezing this site and, through `/api/archive`, the Flutter app at last-good).
  Now one bad show/episode is skipped and recorded in `skipped` (`/healthz`
  `pacifica.catalog.skipped`, server log); document faults and >20 records and 5% still
  reject. `test/pacifica/normalize.test.js`; `npm test` 74/74; real feed 1,171 kept, 0 skipped.
  **Needs a Coolify redeploy.** Schedule week/channels/index still all-or-nothing (item 7).
- **Feed rules (later the same day, Paul: "handle it on our end"):** failed recordings hidden
  and true durations from the file itself (`lib/pacifica/audio-probe.js`: first 16 KB of each
  new mp3, once, saved in `data/pacifica/audio-probes.json`); future-dated episodes held until
  air time; `showTypes` in `stations/kpfk.json` retypes 7 upload shows Music→Talk (Flutter app
  gets 139 episodes back); "Español" → own category **En Español**. All on `/healthz`
  `archiveFilter` (`failedRecordings`, `durationCorrected`, `heldUntilAir`, `audioChecked`).
  Dry run on all 1,172 real files: 3 hidden, 4 durations corrected, 1 held, 0 false alarms.
  `AUDIO_CHECK=off` disables the mp3 check. `tools/run-tests.js` now runs every
  `test/pacifica/*.test.js` (a hand list had skipped the new file). `npm test` 84/84.
  Rules table: docs/APP-FAMILY.md.

## 2026-09-25 (afternoon) — feed text decoding shared with Discovery

**Pushed, not deployed — Paul: redeploy in Coolify, then check `/healthz` `version` changed.**
`lib/pacifica/normalize.js` `plain()` now uses `public/text.js`, the decoder shared with
the Discovery plugin (keep the two copies identical, like `archive-search.js`). Before: ~30
named entities, so `&ocirc;`, `&ouml;`, `&agrave;`… would have shown literally, and an
opening `<p>` ran two lines together. Now: full Latin-1 + typographic entities,
decimal/hex, Windows-1252 numbers, up to three passes, `&shy` without `;`, NFC; unknown
entities stay visible and are logged once ("Unknown HTML entity in feed text").
`/discover`'s `qir-transcript.js` also decodes WebVTT `&amp;` (dormant: `discovery:false`).
Not changed: `server.js` `unescapeHtml()` (inherited WBAI HTML-scraping paths, unused in
JSON-only mode). Test: `test/pacifica/text.test.js` — every entity style through every
listener-facing field of the real `normalizeCatalog`. `npm test` 61/61; local restart:
`/api/archive` 0 entities, accents intact. Upstream ask (Otis: plain UTF-8 in the feed)
is tracked as W7 in the Discovery plugin's HANDOFF.

## 2026-09-25 — upload shows, and what upstream still owes (read first)

**Deployed by Paul (`f79e0a1`).** The listener archive now serves on-air programs in the
published schedule **plus every upload (`2kpfk`) show with episodes**. Before, BradCast
and Bike Talk were missing from podcasts.kpfk.org entirely. Live check: `/healthz`
`archiveFilter.hiddenEpisodes` 4 (was 144); BradCast w/ Brad Friedman 44 episodes, Bike
Talk Podcast 12 with its real image. `archive.kpfk.org` is now an artwork origin (three
upload shows keep their pictures under `archive.kpfk.org/pix/`; image content types only).
The coverage export's "in published schedule" stays on-air-channel only.

**Why they were missing (Otis's data, not fixed here):** BradCast's schedule slot and
picture are on Confessor record 210 (`friedman`, on-air list), but its recordings are
filed under `bradcast2` (upload list, no picture). Bike Talk's current record is
upload-only (`biketalk`, rec 1492); old rec 263 (`biketalka`) was last used 9 Feb.
Email to Otis drafted in the Discovery repo (`.local-notes/otis-email-draft.html`).

**Watch for when Otis fixes it:**

| If Otis… | Then on podcasts.kpfk.org | Do |
|---|---|---|
| files BradCast recordings under rec 210 (`friedman`) | BradCast appears **twice** (`friedman` new episodes + `bradcast2` old ones) until the old ones age out of the feed (~2 months) or `bradcast2` is retired | Ask Otis to retire `bradcast2`; nothing to change here |
| gives `bradcast2` the picture | BradCast gets its picture automatically | Nothing |
| retires `biketalka` / `friedman` | No change here (neither has episodes, so no card) | Discovery: update its `hiddenShows` (its HANDOFF, W1) |

**Newly visible, owed upstream:** upload items with **future air dates** are now served
(Politics Or Pedagogy dated 27 Sept, Informativo Pacifica Online dated this evening).
They are future-dated in the Pacifica feed itself; `test/pacifica/normalize.test.js`
requires that no date filter is applied. Owner: Otis (real publish times). Discovery's
Just aired hides them (its W5).

## State at a glance

| | |
| --- | --- |
| Live | **https://podcast.kpfk.org** — Coolify app "KPFK Podcasts" on the Pacifica/Contabo server, Dockerfile build, container port 8080. Deployed 2026-09-19; `kpfk-archive.supersoul.top` was stopped the same day |
| Repo | https://github.com/pacifica-foundation/kpfk-archive · `main` · push to `origin` only (never `wbai-baseline`). **Moved from `Catskill909` on 2026-09-30**; the old URL redirects, Coolify's stored path and this Mac's `origin` were updated the same day. First deploy from the new location done 2026-10-01 (`32130a1`, storage id unchanged) |
| Deploy | Manual Coolify redeploy after push. **Last: 2026-10-15, `abfb3cc`/`6280446`** (site audit fixes; later commits are docs), checked live by Claude the same day: new `version`, `instanceId` unchanged, `freshVolume:false`. |
| Storage | Named volume `f6vn03cy47znqlbemewq8dd0-kpfk-archive-data` at `/app/data` for the podcast.kpfk.org app: `instanceId` `73039ae5-6589-4ec2-9df5-354de84c0989`, `persistedSince` 2026-09-19, `freshVolume:false` after the 2026-09-24 redeploy. (`e4a9aac9…` below belongs to the retired supersoul.top deployment.) |
| Studio | `/studio`, password in Coolify env `STUDIO_PASSWORD` (runtime only — **not** on the Mac and not in the repo; read it from Coolify, never from a file) |
| Local | `npm start` → http://localhost:8081, `./data` |
| Tests | `npm test` 199/199 on 2026-10-15 (inherited offline suites + Pacifica + Discovery plugin suites). Browser (scratch 8091): `test/homepage/layout-fit.cjs` 47, `listen-along-popups.cjs` 66. |

**Artwork caching (2026-09-24).** `/api/artwork/<id>` used to fetch from Pacifica on every
request (~0.45 s per image, the same on repeats). Images are now kept in memory
(≤600 images / 40 MB, least-recently-used out), shared while in flight, refreshed in
the background after 6 h (stale copy served meanwhile), warmed at start after the
archive loads (~100 images, ~2 MB), and sent with `Cache-Control: public, max-age=86400`
plus an `ETag` (If-None-Match → 304). Local measure: repeats 0.45 s → <1 ms.
`ARTWORK_WARM=off` skips the warm-up (offline tests). Deploy pending at time of writing.

**Accessibility (2026-09-24):** Discovery now has `docs/ACCESSIBILITY.md` (WCAG 2.2 AA,
custom build, axe-core in tests only, no overlays, transcripts as WCAG 1.2.1), aligned
with this repo's `docs/accessibility.md`. Apply the same test plan here.

## Deployed 2026-09-24 (evening) — live on podcast.kpfk.org

Verified live after Paul's Coolify deploys; `instanceId` `73039ae5…` unchanged,
`freshVolume:false`.

- **Homepage gallery = one card per show** ("99 shows · 1034 episodes"); list view stays
  the full table of recordings. Ace's review point (episode feed read as a directory).
- **Sort menu** beside All categories, same component: A–Z (default) · Recently aired ·
  Category (headings). Per-visitor, `?sort=`, restored on Back, synced with the list's
  column headers. Phones: icon-only sort, no carets.
- **Keyboard bug fixed in both dropdowns** (the ↓ that opened a menu skipped the current
  choice).
- **Search:** matched words highlighted (22% tint of `--accent-2`); cut previews expand
  in place (Show more/less); a topic over 200 characters is a description, not a title.
  All in the shared `public/archive-search.js`, kept identical with the Discovery
  plugin's copy.
- **"Discover shows" link removed** (`plugins.discovery: false`); Discovery lives at
  kpfk-discovery.pacifica.audio. Front-facing integration is on hold.
- Tests: `npm test` 56; browser `test/homepage/sort.cjs` 18, `test/homepage/search-titles.cjs`
  11 (app on 8081, Chrome CDP 9231).
- Flutter sister app (`kpfk-podcast`): HANDOFF "Update 2026-09-24" lists what to port.

## Resume here — current session checkpoint (2026-09-24)

- **Live now:** core show/episode search (`archive-search.js`). "jazz" finds 4 shows
  by description; episode matches stay rare because the Confessor feed carries a
  topic for only 28 of 1,177 episodes and no episode descriptions.
- **Big finding — cue files:** every Confessor episode has `vtiUrl` →
  `archive.kpfk.org/cue/<id>.vti`, a WebVTT **song playlist** (title, artist,
  times). 47 of 60 sampled episodes had tracks (~4 each; music shows full lists,
  talk shows bumpers). This is the searchable content for all stations without
  the QIR API. **Next template work:** read cue files server-side (conditional,
  cached on the volume), show "Songs in this episode" with tap-to-play, and add
  songs/artists to `archive-search.js`. Parser and design:
  kpfk-discovery-plugin `public/playlist.js`, `docs/LISTEN-ALONG.md`.
- **Plugin (`/Users/paulhenshaw/Desktop/kpfk-discovery-plugin`, port 8082):** QIR
  live with Ace's key (2,983/2,984 episodes), QIR default, archive artwork for QIR,
  shared search, Discover | Admin tabs with a persisted QIR on/off switch, and a
  **Listen along** prototype (transcript / song-list drawer and phone bottom sheet)
  for review. Read its HANDOFF before plugin edits.
- **This repo's embedded QIR copy** (`lib/qir/service.js`) got the same
  per-record validation fix (`d3ca868`). The embedded `/discover` page is
  superseded by the plugin; remove it once the plugin ships.
- **Later template phase:** [station setup in admin](docs/kpfk/station-admin-template-plan.md);
  the plugin's Admin tab is where station skinning from Confessor JSON will start.
- **Private conversation:** `.local-notes/client-review-2026-09-23.md` is
  Git-ignored. An email to Ace is being prepared (data issues and questions);
  none sent yet.

## Plugin extracted to its own private repository — 2026-09-23

**Future plugin development belongs in `/Users/paulhenshaw/Desktop/kpfk-discovery-plugin`.**
Private repo: https://github.com/pacifica-foundation/kpfk-discovery-plugin.
Working repository name only; product name intentionally undecided (Paul).
Independent local server: **http://127.0.0.1:8082**; template stays on 8081.

The standalone app includes the approved design, QIR adapter, transcript search,
full technical docs, Dockerfile/CI and template-style player/scrubber. Initial implementation commit `ae5b937` and handoff commit `9b36196` pushed; private visibility verified. 10 offline tests and 15 live
browser checks passed. No live deployment and no working QIR key yet. Private
notes, data and this repo's Git history were not copied. The embedded Discover
files remain a historical development snapshot; do not evolve both copies.
See the new project's README and HANDOFF for authoritative plugin status.

## QIR beta foundation — 2026-09-23

[Build status and limitations](docs/kpfk/qir-beta-build.md): Discover now has an
explicit archive/QIR selector, metadata/date filters and QIR transcript loading,
local transcript search and timed cue playback. Server-only adapter exists;
**working QIR credentials still pending, no live QIR verification**. Tests used
controlled responses for transcript paths. Chapters and global full-transcript
search remain future work. Current local URL: http://localhost:8081/discover.

## Direction update — KPFK beta plugin and station template

Paul clarified: the new design belongs first to the KPFK QIR beta plugin,
demonstrating Ace's VPS API, transcripts, markers when supported and advanced
search. Core fixes continue; global-template adoption is decided phase by phase.
The Flutter sister app at `/Users/paulhenshaw/Desktop/kpfk-podcast` follows the
same boundary: ordinary catalog/search/playback remain independent of QIR, while
advanced discovery and transcript features are an optional, modular feature that
can be enabled per station. Its mobile integration is planned, not implemented.
The standalone discovery app/repository continues independently so the provider
API can change or move without forcing changes to every station app. See
[cross-platform discovery module plan](docs/kpfk/cross-platform-discovery-module.md).
The standalone plugin offers archive preview and a QIR mode that reports
connection pending without credentials; no live QIR connection is verified. Working credentials are pending. KPFK beta/production comes before
scaling to other stations.

Added explicit future scope: [admin station setup](docs/kpfk/station-admin-template-plan.md)
for JSON feed addresses, uploaded images, editable text, validated persistent
settings and plugin controls. This replaces the old planning hold; implementation
follows the current fixes/plugin work.

## Discover plugin — 2026-09-23

The preferred prototype is now an optional bundled interface at
**http://localhost:8081/discover**, linked as “Discover shows” in the main menu.
KPFK enables `plugins.discovery: true`; missing/false disables the route and
assets. Main app stays at `/`; QIR remains separate. [Config and evidence](docs/kpfk/discover-plugin.md).
Full test suite passed (43 Pacifica tests plus inherited suites); browser verified.
No deployment; local template server running on 8081. This embedded view is superseded for future plugin development by the independent 8082 project.

## Main app search — 2026-09-23

Implemented locally at **http://localhost:8081/?q=jazz**: richer metadata search,
separate show/episode results, ranked matches, grouped previews, scopes and honest
episode labels. Uses the existing player/sheets; no API plugin or deployment.
[Implementation and evidence](docs/kpfk/core-search-phase.md). Offline suite passed
(42 Pacifica tests plus inherited suites); focused browser checks passed. Next:
review integrated search, then homepage directory and modal layout integration.

## Local design prototype — 2026-09-23

Phase 0b built: [review notes and verification](docs/kpfk/phase-0b-review.md).
Run `npm start`, then open **http://localhost:8081/review.html**. Existing app
remains at `/`. Real catalog data, independent search, show/episode dialogs and
native audio playback; no QIR dependency. The approved concept was extracted into the separate plugin repository. No template
deployment. The old prototype files remain under `public/`; decide their release
disposition when the template work is committed or deployed.

## Client feedback review — 2026-09-23

Investigation and proposed phases: [review plan](docs/kpfk/client-review-plan-2026-09-23.md).
Reviewed four annotated screenshots, local implementation and live public API data.
Initial investigation made no application changes. A separate phase 0b prototype
has since been built (see above). Next: review the interactive layouts
and the [QIR API review](docs/kpfk/qir-api-review-2026-09-23.md). The supplied
API specification is now reviewed; authenticated access is pending. Core browsing fixes can
proceed independently of optional enrichment. Paul explicitly requires a dedicated,
modern search-results design as a core feature with the plugin disabled. Existing RSS, scheduled-program and
artwork policies remain in effect pending explicit decisions.

## Flutter companion — started 2026-09-21

Separate clone: `/Users/paulhenshaw/Desktop/kpfk-podcast`, based on
`Catskill909/podcast_app` at `006b5f0a`. Bundle/application ID on iOS and Android:
`podcast.pacifica.kpfk`. **No live radio, no schedule UI, NO MUSIC SHOWS** (Paul).
Uses this deployment's `/api/archive` JSON and requires both program and episode
to be explicitly Talk, with no Music category. The web archive's existing content
policy remains unchanged. Existing KPFK header and native icon artwork are reused.
Plan and audit: [docs/kpfk/flutter-app-plan.md](docs/kpfk/flutter-app-plan.md).
Implementation/test/build status is in the Flutter clone's own `HANDOFF.md`.

Re-verified 2026-09-21: `/healthz` answers `station:"kpfk"`, `ready:true`, catalog
fresh; archive, artwork, audio range and share routes all respond. Old supersoul
URLs in historical audit entries below describe past deployments.

## What the app is now

KPFK's on-demand archive, read entirely from Pacifica's public JSON feeds
(`archive.kpfk.org/fe_feed/…`), with WBAI's player, sheet, schedule and studio.

- **Archive:** every episode of every program in the **published schedule**, plus every
  upload (`2kpfk`) show with episodes (since 2026-09-25) — ~1,160 episodes. Programs no
  longer scheduled are hidden, by Paul's decision; so are music episodes past 14 days and
  shows in `withheldShows` (The Aware Show, 2026-10-01). `/healthz` `archiveFilter` shows
  the basis and every rule's count.
- **Schedule:** WBAI's look — today-first seven days, artwork cards,
  "Category · Host", Live badge by real slot times, no week picker.
- **Artwork:** from the catalog `photoUrl` only. Shows with no catalog image get the
  dark waveform placeholder. Schedule and now-playing images are joined from the catalog,
  because Pacifica's own fields there are a bare `/pix` folder.
- **Branding:** KPFK logo, KPFK PNG icons (lock screen, home screen, manifest),
  1200×630 share card. No WBAI asset is served (test-enforced).
- **Side menu:** built from `links` and `social` in `stations/kpfk.json`. It has
  X/Facebook/Instagram/YouTube, Schedule, Programs A–Z, Android and Apple apps, About,
  Pacifica, News, Donate, Volunteer, Contact, Privacy, and kpfk.org. Donate and Privacy open
  `docs.pacifica.org/kpfk/…` in the in-app frame. The header Donate button is shown.
- **App is JSON-only.** Feed problems go to Otis (Pacifica feed developer), not to
  scraping. Paul has discussed the known feed bugs with him.

## What `stats/` is

It comes up constantly, so: `stats/` is a folder **inside the storage volume**
(`/app/data/stats/`) holding **one small JSON file per calendar month**
(`2026-09.json` — hundreds of bytes to a few KB). It has no URL; it is not served.
That file is the entire usage database. There is no database server and no log files.

Each file is daily counters and nothing else:

```json
"2026-09-15": { "pageviews": 22, "plays": 1, "live": 2, "searches": 2, "shares": 0,
  "listenSeconds": 265, "liveSeconds": 264,
  "byShow": { "kpfk.kpfk.somethihappenihour": 1 },
  "secondsByShow": { "kpfk.kpfk.somethihappenihour": 1 },
  "byZone": { "national": 22 } }
```

- **No identifier of any kind** — no IP, cookie, session, device, user agent, and
  never the words typed into search (only that a search happened). The visitor IP is
  used once in memory for a rate limit, HMAC'd with a salt regenerated each boot and
  never written. `byZone` is the browser's own clock reduced to three buckets; the
  real timezone is discarded on arrival. The README states this publicly — change the
  README in the same commit if collection ever changes.
- **Why it is called irreplaceable:** it is the only thing this app *creates*.
  `pacifica/` is a copy of feeds Pacifica will hand back; `stats/` cannot be
  reconstructed from anywhere if it is lost.
- **Who reads it:** the studio's Listening section, Most listened shows and Reach.
  Monthly rollups are kept forever (they are tiny); "All time" means "since the
  oldest file". Counters are flushed to disk every 5s (`STATS_FLUSH_MS`) — the
  comment above it explains why 60s lost plays in production.

## Open items, in order

0. **`STUDIO_PASSWORD` — closed, do not re-raise.** The live password was shared in a
   chat transcript on 2026-09-15 so the studio fix could be verified. **Paul's call,
   same day: leave it.** Private machine, private conversation, and what studio access
   grants is a read-only dashboard plus rate-limited, idempotent feed refreshes — it
   cannot change content, listener data or configuration. Rotating it is one field in
   Coolify plus a redeploy whenever he wants it.
   *Also done 2026-09-15:* `.env.coolify.local`, the generated paste-into-Coolify
   scratch file that held it, was deleted from the Mac. It was never committed
   (`.env.*` is git-ignored) and nothing read it, so the value now exists **only** in
   Coolify's env. `.env.example` remains — a template, no secrets.
1. **Exports — phase 1 built 2026-09-16, not yet deployed.** The studio has an
   **Export** section at the top of the page: a calendar month (or all time) of the `listening` counters
   as Daily / Shows / Reach CSV, one JSON file, and a Read me. Spec, decisions and
   what changed from the plan: [docs/exports.md](docs/exports.md) ("Phase 1 — as
   built"). **Next:** Coolify redeploy, then the live audit (acceptance criterion 8:
   download September's Daily CSV on the live site and open it in Excel/Sheets).
   **Export is a dialog from the header button** (Paul, 2026-09-16). The old plain
   download links "started but downloaded nothing" on the live site; the dialog's
   fetch-then-save download **works live** (Paul, 2026-09-16). The old links' exact
   failure was never isolated.
   **Re-planned 2026-09-16 (Paul)**, and built the same day: **1b date spans**
   (from/to + presets) and **1c backup + import**, so the app and its data can move
   between servers (Export → Backup & restore: preview, then replace; undo; moving
   guide in docs/DEPLOYMENT.md). **Phase 2 built too:** *Archive* (inventory, by
   local air date) and *Coverage* (every catalog show and its gaps) in the Reports
   tab. **Phase 3 built:** the printable report (`/studio/report`, Export → Printable
   report → Open report, then Print or save as PDF). **Phase 4 built:** station
   profile export and [docs/exports-for-pacifica.md](docs/exports-for-pacifica.md).
   **Every export phase is built, deployed and verified live** (Paul, 2026-09-16:
   "everything works"). Live HTTP audit of that deploy: `studioVersion` 4-part and all
   six studio/app assets byte-identical to the repo; `instanceId` `e4a9aac9…`
   unchanged, `freshVolume:false`; feeds ready, filter `schedule`; every export,
   backup and import route 401 signed out, `/studio/report` 302 to `/studio`; CSP
   intact; `/api/station` still without feeds. **The phased export plan is complete.** Paul is testing everything together
   after the build (2026-09-16), so nothing from 1c onward has been tried live yet. Spec: "Revised plan" in docs/exports.md.
   *Found while building it, not fixed:* the dashboard's **Most listened shows**
   (`usageReport().topShows`) and **show history** (`showHistory()`) fell back
   to the slug for a show that has left the schedule — **fixed 2026-09-16** — they read only
   `episodeRecords()`. The export reads the catalog mirror as well
   (`exportShowTitle()`). Routing those two through the same lookup is a small
   change; it was left out to keep this commit to the export.
2. **Station settings in the studio — planned scope expanded (Paul, 2026-09-23).**
   The September 16 hold is superseded by the [station-admin plan](docs/kpfk/station-admin-template-plan.md);
   implementation follows the KPFK fixes/plugin beta. Historical context: Kept for the next
   station clone; KPFK is the template and still in beta. Spec not yet written. Paul, 2026-09-15: the
   **station timezone should be settable in the admin panel** rather than only in
   `stations/kpfk.json`. This would be the studio's first setting that *writes station
   configuration*, so it needs an override file on the data volume, precedence rules
   against the profile, validation, and it moves schedule rendering as well as
   reporting. Deliberately kept separate from the export build. Exports do not depend
   on it — they report whatever timezone is in force when they run.
3. **Backups — disaster recovery is covered, do not re-raise *that*.** (Moving the app
   between servers is a different need and is now planned: item 1, step 1c.) The VPS has snapshots and full
   backups for 10 days (Paul, 2026-09-15), so `tools/backup-data.sh` is redundant for
   disaster recovery. What snapshots do *not* give anyone is a portable, readable,
   longer-than-10-days copy — that is what the export above is for, and it is a
   reporting feature, not a backup feature.
4. **Artwork:** 20 scheduled programs have no image of their own, and Confessor has
   no image for them either. **Changed upstream by 2026-09-16:** the catalog no longer
   sends an empty `photoUrl` for them — it sends Pacifica's generic station picture
   (`https://confessor.kpfk.org/pix/KPFK_med.jpg`, on 78 shows). So the **listener app
   now shows that generic picture** for those 20 programs, not our dark waveform
   placeholder. **Decided (Paul, 2026-09-16): use it.** If the feed sends an image,
   the app shows it; the waveform placeholder is only for a blank field. No code
   change — that is already the behaviour. The coverage export and printable report
   still count the generic picture as "no artwork of their own" on purpose: they are
   the list of programs whose real artwork still needs uploading in Confessor
   (docs/exports.md phase 3). Examples: Something's Happening ×6, Counterspin, Radio Maiz,
   Contacto Ancestral, Making Contact. KPFK staff need to upload it in Confessor; it then
   appears automatically. Evidence: `docs/kpfk/artwork-evidence-2026-09-15/`.
5. **Android app link — done.** `links.androidApp` is the public Play listing (`1734883`).
6. **Browser test suites** (`test/live-stream` normal + `--strict`, `test/ui`,
   `test/schedule`, `test/episode-rail`, `test/share`, `test/touch`, `test/motion`)
   are inherited from WBAI and not adapted. Until they are, check Listen Live and one
   archive episode on a real phone after player changes.
7. **Docs:** WBAI-era docs in `docs/` (ARCHITECTURE, DEVELOPMENT, schedule-dev, …)
   describe WBAI's XML/scrape design. They're marked in `docs/README.md`; rewrite each
   when you next touch its area.
8. From the original plan (`docs/kpfk/implementation.md`): program-only deep links,
   studio source-health wording for JSON feeds, desktop (Tauri) KPFK build. None block
   the live web app. **Fixed 2026-09-16 — was WBAI-shaped in the studio's System panel:** "Programs 0"
   (the scraped `/programlist/` directory, which KPFK does not use) and "Records on disk
   at boot: 0 shows, 0 feeds" (the XML feed store, empty by design here — the Pacifica
   snapshots live in `data/pacifica/`). Both are labels, not wrong data; the two
   *charts* with the same problem were fixed on 2026-09-15 (see below).

## Session log — 2026-09-15

Codex did the JSON conversion (adapters, service, schedule, fixtures, `docs/kpfk/`).
Claude Code then made these changes, each committed with its evidence:

| Commit | Change |
| --- | --- |
| `f7f6222` | Initial push of the Codex conversion to GitHub |
| `21f1196` | Schedule rebuilt on WBAI's UI; slots get same-origin artwork (CSP had blocked it) |
| `5cb36d1`, `96ff717` | Artwork evidence for Pacifica (catalog vs Confessor vs RSS, per-show CSV) |
| `0b2e633` | Archive shows only scheduled programs (`service.archive()`) |
| `225677b` | Deployment audit: compose file was WBAI's (would collide with WBAI's volume), Dockerfile/backup/doc fixes, container rehearsal 24/24 |
| `e49ee12` | `/healthz` no longer reports a schedule outage straight after boot (warm-up) |
| `9272962` | WBAI's icon PNGs replaced (they showed WBAI on lock screens); PNG share card, touch icon, manifest |
| `1276a51` | Side menu from the station profile; donate + privacy links; CSP frame-src from links |
| end of session | Docs: README, CLAUDE.md, this handoff, `docs/README.md` index, implementation checkpoint |

**Live audit after that deploy, over HTTP:**
- **Storage proof passed:** same `instanceId`, `freshVolume:false`, named volume, nothing quarantined.
- **Deployed bundle** matches the repo's `version` sizes.
- **Share card, icon and touch icon** are served byte-identical to the repo.
- **Menu:** 12 items and 4 socials, zero "WBAI" in the page.
- **CSP** `frame-src https://docs.pacifica.org`; studio API 401 without a session; no feed errors.

## Session log — 2026-09-15, evening (studio)

Paul reported that the studio's **Most listened shows** chart named shows by slug
(`kpfk.kpfk.reggaecent`) where WBAI's shows real titles.

| Commit | Change |
| --- | --- |
| `761816b` | `usageReport()` read WBAI's XML `feedStore` for titles; on a station build that store is always `{}` (`server.js:383`), so every title fell back to the slug. It now reads `episodeRecords()`, the adapter the rest of the studio already used |
| `fb3168a` | Studio stops reporting what the JSON provider cannot measure: **Total size** (Pacifica carries no file sizes — the tile read "0.0 GB", which says *empty archive*, not *unmeasurable*) and the two **program-directory** coverage ratios (WBAI's scraped `/programlist/`, which read "0 of 99 matched"). Server sends `totals.bytes: null` and omits `coverage.directoryPrograms`; the page omits the tile and the meters |

**The class, for next time:** anything in the studio that reads `feedStore`,
`programCache` or per-episode `bytes` is reading a **WBAI XML-era source** that is
empty on a JSON station. Show data comes from `episodeRecords()`; descriptions from
`showInfo`. A count of 0 from those sources is not a finding, it is the wrong
question — either route it through the adapter or omit it, but never draw it as a zero.

**Tests** (`test/pacifica/http.test.js`, the real-server suite): it now signs in to
the studio, sends real `play` and `listen` beacons for one scheduled episode, and
asserts that every show named by `usage`, `stats` and `showhistory` carries the
archive's title, and that the studio reports no byte total and no directory ratio
while still reporting the totals it *can* measure. Both assertions were run against
the unfixed code and shown to fail (`kpfk.kpfk.backgroundbriefing`; `bytes: 0`).
`npm test` green: 28 Pacifica tests + the inherited offline suites.

**Browser proof of the client change** (CLAUDE.md §1), headless Chrome against
`/studio.js?v=aeb1-mu39hr9h`, the bundle the page actually loaded: tiles render
`Shows · Episodes · Audio held · Categories · Window` with no size tile, Coverage
renders the single ratio `99 / 99 · 100%`, and no empty gap lists. Five tiles were
still seen, so the absence is measured, not assumed.

**Live audit of the `761816b` deploy** (https://kpfk-archive.supersoul.top):
- **Most listened shows** now reads *Stairway To Heaven, Reggae Central, Global
  Village - Tuesday, Way Out West, Breakbeats And Rhymes* — no slugs in the usage
  chart, the 99-row table or show history.
- **Storage:** `instanceId` unchanged, `freshVolume:false`, named volume, nothing
  quarantined; the usage counters survived the redeploy and kept counting.
- **Deploy was real:** container booted 78s after the commit; `app.js` and
  `styles.css` served byte-identical to the repo; `X-App-Version` matched `/healthz`.
- **Feeds:** catalog, channels, schedule index, three weeks, now-playing all ready,
  none stale, no errors. Filter `schedule`: 1,004 episodes / 99 programs, 142 hidden,
  no `2kpfk`.
- **Artwork:** all 1,255 `photo` fields (archive, directory, now-playing, schedule)
  same-origin; all 82 distinct images load. Note the sibling `photoUrl` is the raw
  `confessor.kpfk.org` URL by design — it is data, never handed to the browser
  (`lib/pacifica/service.js:24`).
- **Branding/security:** no "WBAI" or "99.5" in the app or the studio; icons and
  share card byte-identical; CSP intact; studio API 401 signed out; bogus beacon 204.
- **Not an exposure:** `/data/stats/` answers 200 only because any extensionless path
  falls back to `index.html`. Real files under `/data/` 404. `stats/` is a directory
  *inside* the volume, with no URL.

**Live audit of the `fb3168a` deploy** (booted 2026-09-15 23:03 UTC):
- **Deploy is real:** live studio bundle moved `ac50-…` → `aeb1-…`; `studio.js` and
  `app.js` served byte-identical to the repo.
- **Payload:** `totals.bytes` null, `coverage.directoryPrograms` and `noDirectory`
  absent, `withDescription` 99/99 kept, measurable totals still real (1,005 episodes,
  990h, 8 categories), zero slug-shaped titles in usage, table or thinnest.
- **Browser proof** against `/studio.js?v=aeb1-mu3a29kd`, the bundle the live page
  loaded: tiles `Shows · Episodes · Audio held · Categories · Window` (no size tile),
  Coverage `99 / 99 · 100%`, no empty gap lists, no page errors.
- **Storage:** same `instanceId`, `freshVolume:false` — third redeploy running, and
  the counters kept counting (7 plays, 3,271s listened by then).
- **Feeds:** all ready, none stale, no errors; catalog grew to 1,147 episodes.

## Session log — 2026-09-16 (exports, phase 1)

Built phase 1 of [docs/exports.md](docs/exports.md): the `listening` dataset.

- `lib/export/csv.js` (RFC 4180, BOM, CRLF, formula-cell guard) and
  `lib/export/listening.js` (pure builder, column allow-list, manifest).
- `server.js`: `GET /api/studio/exports`, `GET /api/studio/export`,
  `exportShowTitle()`; `usageReport()` now shares `dayCounters()` and `zoneLabel()`
  with the export.
- Studio: Export section, first on the page (`admin/studio.html`, `public/studio.js`,
  `public/studio.css`).

**Evidence:** `npm test` green (32 Pacifica tests + inherited suites). Seven planted
bugs each seen to fail `test/pacifica/export.test.js`. Local 8081 restarted and
checked over HTTP (401 signed out, index, CSV headers). Headless Chrome ran
`/studio.js?v=b5fa-mu456ujp`, matching `/healthz` `studioVersion`: Export was
visible with *September 2026 / All time*, and all five links answered 200 with the
right filenames and a BOM on each CSV. `test/studio/run.sh` layout and sort suites
passed against 8081 at every width from 1280 to 360px.
**Not yet done:** deploy and live audit.

## Session log — 2026-09-16, afternoon (light-mode card container)

Paul: dark-edged artwork made the gallery cards look ragged on the cream page. Built a
**light-mode-only** card container; **dark mode must not change** (Paul's rule).

| Commit | Change |
| --- | --- |
| `22a0af7` | `.card-wrap` becomes a padded, rounded container (6px mat, 4px on phones); title, More link move in by the mat |
| `e0b35c7` | Mat `#f4eee6` — deployed, but invisible at normal distance against the white listing panel |
| `f9d0abf` | Mat `var(--surface-3)`, outline 16% / 18% hover — chosen from four tints rendered side by side |
| `a85deb9` | Shadows are the header pills' `--elev-1` / `--elev-2`; darker, taller title scrim so artwork lettering stops competing with the card title |
| `9ea69da` | List view: `.show-thumb` gets the same container at 60px — 3px `--surface-3` mat as an inset spread shadow, placeholder background clipped to the content box (no station asset path in the block), image inset by the mat |
| `2eb1eaa` | Info sheet: `.sheet-art` gets the same container with a 5px mat (18px frame, 13px art); the zoom badge moves in by the mat. Probe note: let the sheet's open animation settle (~3s) — a sub-pixel offset otherwise makes identical CSS screenshot two ways |

- **Scoping:** every rule is written twice — `:root[data-theme="light"]` and, inside
  `@media (prefers-color-scheme: light)`, `:root:not([data-theme])` — because
  `theme-boot.js` only sets the attribute on an explicit pick. The block sits after `.card-date`.
- **Proof dark is untouched:** headless Chrome, all four theme states (OS dark/light ×
  no pick/opposite pick) at 1280 and 390px, committed CSS vs edited CSS **on the same feed
  data** — pixel-identical. Two traps: a new episode between runs changes every screenshot
  (re-baseline, don't compare to a morning shot), and the first load in a fresh Chrome
  renders differently (warm up with one unmeasured load).
- **Live audit (`a85deb9`):** `styles.css`, `app.js`, `theme-boot.js` byte-identical to repo;
  `X-App-Version` = `/healthz`; `instanceId` `e4a9aac9…` unchanged, `freshVolume:false`;
  all feeds ready, filter `schedule`.
- Ported to WBAI the same day as one block (same tokens, same theme logic).

**Loose ends tied up the same evening (Paul: "so they don't get lost"):**

| Commit | Change |
| --- | --- |
| `854bc06` | **`/healthz` false "stale".** Feeds refresh lazily (no timer), but `health()` called "older than TTL" stale, so now-playing (15s TTL) read stale most of every minute and the catalog/schedule did whenever the site was quiet. `isStale(s)` = last refresh failed. Test `health: idle past TTL is not stale; a failed refresh is` failed on the old code. WBAI has no Pacifica layer — not affected |
| `f469381` | **Reduced motion still lifted dark-mode cards.** The override `.card-art.play-btn:hover` (0,3,0) lost to the lift `.card-wrap:hover .card.card-art.play-btn` (0,5,0); it now names the lift's selector. Paul approved touching dark mode for this. New suite `test/motion/reduced-motion-hover-tests.js` (wired into `test/motion/run.sh`, `APP_URL` for :8081) hovers every `:hover` rule that sets a transform and fails if the element's position changes; it failed on the old CSS and found no other instance. It lists what it can't reach (live-player controls, pseudo-elements) |
| `8bcb524` | Light-mode container for the last three artworks: player bar, the sheet's docked mini player, the past-episodes header (3px mat; image is in flow, so the mat is padding) |

Probe lessons from this round: **pin a probe to a show by title** — "first row" changed
*mid-run* when a new episode arrived and made dark mode look changed; and a desktop
sheet screenshot needs ~3s to settle. The scratch probes live only in the session
scratchpad; the reduced-motion suite is the one that became a real test.

## Next: port the exports to WBAI (Paul, 2026-09-16)

A **separate job in the WBAI folder** (`/Users/paulhenshaw/Desktop/wbai-archive`), its own
commits and deploy. Nothing is shared between the two apps' code or data. Decided:
- A WBAI backup holds usage months **and `data/feeds.json`** (WBAI's accumulated episode
  history, which upstream cannot re-send).
- Restoring a WBAI backup onto a WBAI server **merges episodes per show** (WBAI's own
  `mergeFeedItems`: keep every episode, no duplicates); usage months preview-then-replace.
- No published schedule and no station profile on WBAI: coverage drops that column, the
  profile export is not offered.
