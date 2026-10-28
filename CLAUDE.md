# CLAUDE.md — working rules for the KPFK Archive

This repo is **the** active project (since 2026-09-15). It began as a copy of
`wbai-archive`; WBAI is now maintenance-only in its own folder. Read
[HANDOFF.md](HANDOFF.md) for current state before starting work.

**Three apps share this feed — read [docs/APP-FAMILY.md](docs/APP-FAMILY.md).** This app
serves `/api/archive` to the Flutter app (`~/Desktop/kpfk-podcast`) and to the Discovery
plugin (`~/Desktop/kpfk-discovery-plugin`). A change to feed parsing or to `/api/archive`
reaches both without a deploy of theirs. That file is identical in all three repos; when
it changes, copy it to the other two.

Guardrails that exist because we lost hours to them (most learned on WBAI, all
still true here). Follow them.

## 1. NEVER-STALE RULE — prove the browser ran the code you're judging

Editing `public/app.js` / `styles.css` and judging the result against a cached
copy the browser never reloaded cost days on WBAI. See
[docs/big-audio-bug.md](docs/big-audio-bug.md).

- `index.html` is served `Cache-Control: no-store`; `app.js` / `styles.css` links
  are version-stamped `?v=<size-mtime>`. `curl -s localhost:8081/healthz` →
  `version`; the page's `X-App-Version` header must match after a reload.
- Never conclude a client change did or didn't work until the versions match.

## 2. SERVER-REBOOT RULE — local server is port **8081**

Node does not hot-reload. `server.js`, `lib/**`, `stations/*.json` → **restart
required**. `public/*` → no restart (served fresh, version-stamped).

```sh
node --check server.js
PID=$(lsof -nP -tiTCP:8081 -sTCP:LISTEN); [ -n "$PID" ] && kill $PID; sleep 1
npm start &                     # tools/start.js: stations/kpfk.json, PORT=8081, DATA_DIR=./data
curl -s localhost:8081/healthz  # expect station:"kpfk", archiveFilter.basis:"schedule"
```

**Kill only the 8081 process.** WBAI may be running on 8080 from its own folder —
never touch it from here. A backend change is not done until the restarted server
is verified.

## 3. DEBUGGING DISCIPLINE

- **Change one variable at a time.** If the symptom moves with each edit, you're
  perturbing a race — stop guessing and get evidence.
- **Don't swallow errors.** `.catch(function(){})` on `audio.play()` hid real
  failures for hours on WBAI. Log rejections; if something must be caught, say
  in a comment what and why.
- **Prefer the boring standard model.** Before touching live audio read
  [docs/live-audio-pattern.md](docs/live-audio-pattern.md): the live element is
  built and thrown away per play — never reuse it, never branch on `element.paused`.
- **Never open a layer on a timer after a history step.** Closing a sheet, the schedule
  or Now Playing calls `history.back()`/`go()`; on an iPhone the popstate lands late and
  closes whatever opened meanwhile (2026-10-15: Transcript and Episodes from Now Playing
  "did nothing"). Use `ArchiveApp.closePopups(then)` — it waits for the popstate. Test
  such paths with history held back (`test/homepage/listen-along-popups.cjs` "slow phone").

## 3a. ASSERT THE EFFECT, NOT THE DECLARATION

A green suite that measures the wrong thing argues you're fine.

1. **Assert what the user experiences**, not what the code declares — synthesized
   input and real rendered HTML over reading styles or calling builders.
2. **Beware APIs that bypass the thing tested** (`scrollTop` moves a locked page;
   `p.click()` scrolls into view first — use `p.clickInPlace()`).
3. **One probe point is not a measurement** (`pageScrolls()` sweeps five points).
4. **Make "not X" assertions prove they can still see X** — the regression tests
   for the 2026-09-15 bugs (same-origin photos, scheduled filter, boot warm-up,
   WBAI assets, share tags) were each run against the unfixed code and shown to fail.
5. **The CSP (`style-src 'self'`, `img-src 'self'`) silently voids** injected
   `<style>`, inline `style=""`, and any cross-origin `<img>`. Set custom
   properties through CSSOM; hand the browser only same-origin (`/api/artwork/…`)
   or `/assets/` images.

6. **A check that crashed is a FAIL.** A browser helper that turns a page error into text makes
   every check using it pass on a crash (2026-10-27: the studio banner check passed on code with no
   banner). Helpers return `false` on error and print why.

A test that has never failed has never been shown to work.

## 4. PROD IS NOT YOUR LAPTOP — read its state, don't infer it

**Live:** https://podcast.kpfk.org (Coolify on the Pacifica/Contabo server,
Dockerfile build pack, container port 8080 — Coolify's **Ports exposes** must be
`8080`, because it injects that value as `PORT` and overrides the Dockerfile's
`ENV PORT`). Deploys are manual — **push is not deploy**; a change is
live only after a Coolify redeploy and `version` in `/healthz` changes.

- Storage is a **named** Coolify volume at `/app/data`
  (`…-kpfk-archive-data`). On the podcast.kpfk.org app (since 2026-09-19)
  `storage.instanceId` is `73039ae5-6589-4ec2-9df5-354de84c0989`, unchanged across
  the 2026-09-24 redeploy with `freshVolume:false`. (`e4a9aac9…` was the retired
  supersoul.top deployment.) **If that id ever changes, the volume was replaced.**
- What's on it: `stats/` (usage counters — **irreplaceable**), `pacifica/` (last-good
  feed snapshots — refill from upstream), `.instance.json` (identity; the server
  refuses a data dir stamped for another station).
- Local runs prove the code path, never the storage.
- Never add a Dockerfile `VOLUME`, never use a Coolify **Directory Mount** (host
  path) — always a named volume. `npm run hooks:install` once per clone wires the
  storage-safety pre-commit guard; override a line with `storage-safety:allow`,
  never `--no-verify`.
- **The image copies named folders only** (Dockerfile `COPY lib`, `public`, `admin`, `embed`, …). A new
  folder the server reads must get its own `COPY` line, or it works locally and fails only live;
  `test/pacifica/dockerfile.test.js` fails until it does (2026-10-27, `embed/`).
- Backups: `CONTAINER=<name> tools/backup-data.sh /backups` on the VPS. See
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 5. Project shape

- **Zero-dependency Node server** (`server.js`) + vanilla JS front end (`public/`).
  No build step.
- **Station profile** [`stations/kpfk.json`](stations/kpfk.json) holds everything
  station-specific: identity, feed URLs, stream, allowed origins, **side-menu
  links and socials**, logo/icons/share image, category map. Validated by
  `lib/station-config.js`; rendered into the page by `lib/station-view.js`
  (`{{station.*}}`, `{{menu.*}}`, manifest). **Prefer a profile setting over a code
  edit** — this is meant to serve other Pacifica stations.
- **Data layer** `lib/pacifica/`: `fetch-json.js` (bounded, origin-restricted
  fetches), `normalize.js` (catalog, channels, now-playing, schedule → app shapes),
  `service.js` (conditional polling, last-good snapshots, artwork proxy).
  - `catalog()` is an **untouched mirror** of the feed. `archive()` / `peekArchive()`
    is what listeners see: **on-air programs in the published schedule** (Paul's
    policy, 2026-09-15) **plus every upload show with episodes** (`2kpfk`: podcasts
    and online editions such as Bike Talk Podcast and BradCast w/ Brad Friedman,
    added 2026-09-25). Unscheduled on-air programs are hidden, and so is any show in
    the profile's `withheldShows` (no on-demand rights; KPFK: The Aware Show, 2026-10-01),
    in the archive and in Discovery alike. A schedule outage
    falls back to the whole on-air channel (plus uploads) and `/healthz`
    `archiveFilter.basis` says `primary-channel`.
  - Schedule and now-playing `photoUrl` from Pacifica is a bare `/pix` folder;
    every image comes from the **catalog** `photoUrl` joined by show key.
- **The app is JSON-only.** Never scrape Confessor, the archive HTML or RSS to fill
  a gap. If the feed is wrong, it goes to Pacifica's feed developer (Otis).
- **Schedule** (`paintPublishedSchedule` in `app.js`) renders published slots with
  WBAI's schedule markup: today-first rolling seven days, no week picker, Live by
  slot epochs. It must never touch an `<audio>` element.
  **Week grid** (`paintGrid`, [docs/schedule-grid-plan.md](docs/schedule-grid-plan.md)):
  the Grid button in the schedule header, **1024 px and up only — never phones or
  small tablets**; layered above the schedule with its own history entry, so every
  way out lands back on it. A show opens an info card beside it, with **Show page** (opens the show in place of the grid).
- **Two `<audio>` elements share one player bar** via `barMode`
  (`'archive' | 'live'`). Keep the live side as close to the archive side as possible.
- **Popups are one at a time** (Paul, 2026-10-15): a new kind of layer replaces the open
  one (`closePopups`); show → episode stays in one sheet; only the artwork zoom and
  schedule list → show stack; the grid card's **Show page** replaces grid and schedule
  (Paul, 2026-10-24); Back undoes one step. The player bar sits above every popup.
- **Listen Live (`/live`) does live things only** (Paul, 2026-10-27). Live-only header (logo,
  Donate, light/dark, menu — no Schedule or On Air). A show, an episode or the schedule leaves `/live`
  for the podcast front with that popup; closing it stays on the front; the browser's Back returns
  to `/live`. **No bottom player on `/live`** (Paul, 2026-10-28: a plain live player): the page's Play
  is the player; the bottom bar takes the stream over on the front. Leaving shows an explainer first
  (Stay / Go, "Don't show this again", kept per browser); the stream plays through all of it. Phones:
  a slim strip in the header (Play/Stop + show) while the page's player is scrolled away. Never a
  second live player over `/live` (`openLivePlayer` sends you to the page's Play button). Donate opens over it. Autoplay on arrival
  is Ace's ask ("one click to audio"); a refusal leaves one big Play button. One window always:
  new tabs on phones make navigation a puzzle (Paul). Plan: [docs/kpfk/listen-live-plan.md](docs/kpfk/listen-live-plan.md).
- **Fund drive** (Phase 4a, 2026-10-27): the studio's Fund drive card sets on/off (the switch acts at
  once after an in-app confirm, 2026-10-28), name, goal, pledged and an optional donate link
  (`lib/fund-drive.js`, data volume `fund-drive/`; the link's page is checked by `lib/frame-check.js`); `public/fund-drive.js` is the one capsule
  drawing (on `/live`, the studio preview, `/embed/fund-drive`). The embed's frame-ancestors are this
  app and the station's website only; the listener site stays `SAMEORIGIN`.
- **Listen along naming:** "Transcript" (QIR) and **"Playlist"** (cue-file song list, was
  "Songs"). Never rename "Transcript" (Paul).
  **Transcripts and headlines have broken five times** — read [docs/transcripts.md](docs/transcripts.md) before
  changing that path. A failing QIR list refresh must never block transcript requests.
- **`/studio`** is password-gated (`STUDIO_PASSWORD`; unset = routes don't exist).
  Markup in `admin/` — deliberately outside `public/`. Its actions are the only
  state-changing routes: keep them idempotent, rate-limited, CSRF-guarded.
- **Usage counters** (`public/track.js`, `POST /api/ev`) carry **no identifier of
  any kind**, and search words are never sent. The README states this publicly —
  change the README in the same commit if collection ever changes.
- **Template rule: no features for one station's non-standard programming** (Paul, 2026-10-27).
  This app is a template for every Pacifica station. A show, its episodes and its schedule are
  the standard concepts; when a station's data doesn't fit them (KPFK's "Something's Happening":
  an overnight block of ~20 programmes filed as six hourly "shows"), the fix is at the source
  (Confessor, the station), never an app feature such as grouping. Generic tools that any station
  can fill in (e.g. `episodeCorrections` for a mis-filed recording) are fine.
- **No colour coding** (Paul, 2026-10-27): shows, episodes and categories are never told apart by
  colour (tiles, cards, badges, schedule). The `CATS` colours in `app.js` are WBAI leftovers, unused.
- **Branding:** every image in `public/assets/` is KPFK's. `test/pacifica/branding.test.js`
  fails if any served file is byte-identical to a WBAI asset.

## 6. Tests

- `npm test` — inherited offline suites (run in legacy mode) plus
  `test/pacifica/*.test.js`: normalize, service (persistence, outage, scheduled
  filter, same-origin photos), HTTP integration (real server, fixtures, offline
  restart, branding tags, CSP), branding fingerprints, menu rendering.
  Add new offline suites to `tools/run-tests.js` in the same commit.
- Fixtures: `docs/fixtures/pacifica-kpfk-2026-09-14/` — pinned; add a dated set, don't replace.
- **Browser suites** (`test/live-stream`, `test/ui`, `test/schedule`,
  `test/episode-rail`, `test/share`, `test/touch`, `test/motion`) are **inherited
  from WBAI and not yet adapted to KPFK**. Make their WBAI assumptions
  configurable; don't edit expected values until green.
- **KPFK browser suites** (`test/homepage/*.cjs`, `test/schedule-grid/run.sh`) run on a
  scratch server (port 8091, copy of `data/` without `stats/`), never on 8081 —
  `test/schedule-grid/run.sh` starts and removes its own.
- **Listen Live page (`/live`): `test/listen-live/run.sh`** (own server + muted Chrome, real taps:
  arrival, refused autoplay → one tap, the connecting spinner, rollover, live-only header, links to
  the front (closing stays there, Back returns, the stream plays on), no Live popup over the page,
  menu, logo/Back, four widths light and dark). Run it before any push touching the live player or that page.
- **Fund drive (Phase 4a): `test/fund-drive/run.sh`** (own server on 8093 with a test studio password,
  muted Chrome on 9234, real taps: the studio card → Publish → the capsule on /live and in the embed →
  off). Run it before any push touching the capsule, its studio card or /embed/fund-drive.
- **Before every push that touches `public/` or page-serving code: `test/page-load/run.sh`**
  (own scratch server and muted Chrome; every main page at phone and desktop width, no
  uncaught error). `npm test` never loads the page: on 2026-10-27 a start-up crash went live
  with 239 offline tests green.
- **Desktop Chrome is not Safari.** Current Chrome dropped `<button>`'s default
  `align-items:flex-start`; Safari (every iPhone browser) keeps it, so a column-flex button
  with "…" text broke only on iPhones. `test/homepage/layout-fit.cjs` reproduces that default
  through an inspector stylesheet. Check iPhone-only behaviour in WebKit (Playwright, outside
  the repo) or reproduce it the same way — never conclude from Chrome alone.

## 7. Working agreements

- Commit straight to `main` and push to `origin` (GitHub). No branches or PRs.
  **Never push to the `wbai-baseline` remote.**
- Say what you're about to do and roughly how long; anything over ~30 s runs in
  the background. Verify with the tools rather than handing checks back.
- Fix sure things inline; ask only for real decisions. Lead with "fixed", and
  report failures with their output.
- Clean up headless Chrome processes and profile dirs after browser checks.
