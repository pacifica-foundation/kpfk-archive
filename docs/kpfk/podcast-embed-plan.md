# Podcast player embed — plan, and what to reuse from Radio Suite

**Status: built 2026-11-11** (not yet deployed). The player is `/embed/podcasts`; the studio's
**Embeds** tab makes its code and also holds the fund drive capsule's code. What was built, and
Paul's decisions, are in "As built" below; the rest of this file is the plan it was built from.

## As built (2026-11-11)

| Piece | Where |
| --- | --- |
| Settings, ordering, formatting, the feed as the player lists it | `public/podcast-embed-options.js` (browser and Node) |
| The player page | `embed/podcasts.html`, `public/podcast-embed.js`, `public/podcast-embed.css` |
| Fonts (Oswald, Inter; this app's policy allows its own files only) | `public/assets/fonts/` |
| Route, who may frame it | `server.js`: `/embed/podcasts` → `sendEmbed(..., '*')` |
| The studio's Embeds tab | `admin/studio.html` (`#embedsPanel`), `public/studio-embeds.js`, `public/studio.css`; `GET /api/studio/embeds` (the public address for the code) |
| Tests | `test/pacifica/podcast-embed.test.js` (offline), `test/podcast-embed/run.sh` (browser), `/embed/podcasts` in `test/page-load` |

Paul's decisions (2026-11-11), answering §4:

1. **Any website may frame it** (`frame-ancestors *`). The fund drive capsule stays the station's sites only.
2. **Every show on the site**, by reading `/api/archive` (withheld shows and the site's other rules apply by themselves).
3. **Address** `/embed/podcasts`.
4. **Radio Suite's look**: black and white by default, the 11 presets, Oswald and Inter.
5. **Plays count**: `/track.js` runs in the embed (plays, listening time; no identifier). It sends **no page view** from `/embed/...`.
6. **No download buttons**, as Radio Suite ended 2026-11-10.
7. **The Embeds tab holds both codes**: the player's code maker, and the fund drive capsule's code (moved from the Fund drive card, which now links to the tab).

Second round (Paul, 2026-11-11: "mostly great"):

- **Bigger play/pause icons** (22 px in the row's 38 px button, 26 px in the bar's 44 px one).
- **Show info** (a pill under the show's three lines; replaces Read more): the whole description,
  category, counts, **All episodes on KPFK Podcasts** (the site's `/show/<slug>`) and the show's
  website / Facebook / X. Links open a new tab.
- **Transcript** (a button on each episode QIR has one for): the lines with times; the line being
  heard is marked and kept in view; a tap on a line plays that episode from there; scrolling by hand
  stops the following, **Back to now** resumes it. The site's words when QIR has none or is down.
- **Both are overlays over the list, never over the player bar**, which stays usable (the list
  underneath is `inert`). Escape, Close or a tap outside closes; one at a time; no history entries
  (in a frame they would land in the host page's Back).
- **QIR notes one show at a time**: `GET /api/plugins/qir/notes?show=<show key>` (the full list is
  ~340 KB compressed). Gives headlines (as titles where the feed has none, like the site), summaries
  and which episodes have a transcript. A 404 (no Discovery / QIR on the station) means no transcript
  buttons, never an error. The transcript text is the site's own route, unchanged
  (docs/transcripts.md); the parser is the site's (`/discover/qir-transcript.js`, loaded on first use).

Different from Radio Suite, on purpose:

- **No `icon` setting** (no Font Awesome here): the header icon is one drawing; icons are inline SVG.
- **`show=` and `episode=` take the feed's keys** (`kpfk.kpfk.qrcode`, `kpfk.kpfk.140927`). `episode=` alone also picks its show.
- **An episode with no topic is titled by its air time** (the site's rule, `archive-search.js`), so its row shows the length only.
- **Picking another show closes the player** (Paul, 2026-11-11): stopped if playing, the bar removed. Plays on to the next episode within the show.
- **It never calls `scrollIntoView`**: inside a frame that can scroll the host page. It scrolls its own boxes.
- **The studio page alone may frame this site's embeds** (`frame-src 'self'`), for the live preview.

---

Source of the reusable pieces: **Radio Suite** (`~/Desktop/radio-suite`, commit
`7205989`, "Player embeds"). Its write-up is the 2026-11-10 section of
`radio-suite/HANDOFF.md`. Radio Suite in turn rebuilt the look of the podcast-feed
app's player (`~/Desktop/podcast-feed/embed/`, supersoul.top).

This app already has one embed — the fund drive capsule (`/embed/fund-drive`,
HANDOFF 2026-10-27). **Build the podcast embed the same way that one is built**;
take from Radio Suite only what is listed below.

---

## 1. The two apps differ — what that means for reuse

| | Radio Suite | This app | So |
| --- | --- | --- | --- |
| Stack | Next.js 16, React 19, TypeScript | Node, zero deps, plain JS in `public/` | Port **logic and CSS**, not components |
| Data | Its own database | Pacifica JSON feed → `/api/archive` | Read `/api/archive`; add no second data path |
| Episode rules | `lib/api/visibility.ts` (published, Trash, music limit) | Feed rules in `service.js` (withheld shows, under 20 min dropped, …) | The embed must get the **same** rules — by reading `/api/archive` |
| Audio | Served by Radio Suite, per episode | Plays **directly** from Pacifica hosts (`media-src` lists them) | Embed CSP needs the same `media-src`; no audio route |
| Images | Any host | `img-src 'self'` — `/api/artwork/…` or `/assets/` only | Use the artwork URLs the app already builds |
| Styles | Inline `style` for colours | `style-src 'self'` voids inline `style=""` (CLAUDE.md §3a.5) | Set colour custom properties through **CSSOM** (`el.style.setProperty`) |
| Who may frame | Anyone (login decides) | `frame-ancestors` per embed (`embedAncestors()`) | A decision for Paul, §4 |
| Page | `/embed` (React page) | `embed/<name>.html` + `sendEmbed()` + `public/<name>-embed.js` | Copy the fund-drive pattern |

---

## 2. Reuse as-is (port to plain JS)

### 2a. The settings contract — `radio-suite/lib/embed-options.ts`

One file that both the studio card and the player use, so they can never disagree
about a name or a default. Port it to a CommonJS/browser file (e.g.
`public/podcast-embed-options.js`, loaded by both pages; `lib/` copy for server
tests if needed).

- Link parameters: `show, episode, theme (dark|light|auto), sort (newest|oldest|alphabetical),
  limit (5|10|25|50), order (alphabetical|latest|most-episodes), header, selector, cover,
  download, theme_toggle, title (≤60), icon, header_icon, dark, light` (colours as
  6-digit hex **without `#`**, so links need no escaping).
- **Only non-defaults go in the link** (`embedQuery`), so a default embed is just `/embed/podcasts`.
- **A bad value falls back to that one setting's default** (`parseEmbedOptions`) — the
  player sits on someone else's page; it must still play.
- `iframeCode()` escapes every attribute (a title with `"` cannot break the snippet).
- `textOn(hex)`: icon colour on an accent button — **white whenever it reaches 3:1**
  (WCAG 1.4.11), black only on light accents (yellow). The first version picked
  "whichever contrasts more" and gave black icons on the default blue; Paul wanted white.
- Drop `icon` (Font Awesome) unless this app loads Font Awesome — it uses its own icons.

### 2b. Ordering and formatting — `radio-suite/lib/embed-view.ts`

Pure functions, port unchanged: `orderShows`, `episodesToShow` (**"latest N" keeps the
newest N, then orders them** — "latest 5, oldest first" is the newest five oldest-first,
never the station's five oldest), `formatTime`, `formatLength`, `formatAirDate` (in the
station's time zone).

### 2c. The player's look — `radio-suite/components/embed/embed-player.css`

Plain CSS, everything under `.rse`; portable nearly verbatim (rename the prefix).
Dark default `#0a0a0a`, light `#fdfcff`, Oswald headings, Inter text, compact spacing;
accent from `--rse-accent-dark` / `--rse-accent-light`. Swap fonts and tokens for
`docs/DESIGN-SYSTEM.md` if the embed should look like this app rather than Radio Suite.

**Two lessons baked into it — keep them:**

1. **Element resets at zero specificity.** `.rse button { color: inherit }` outranked
   every button class, so the bottom play icon followed the text colour and grey controls
   showed white; one button only looked right through `!important`. Fix:
   `:where(.rse) button { … }`, no `!important`. A test rejects either coming back.
2. **`color-scheme: dark` / `light` per theme**, or the light theme gets a dark scrollbar.

### 2d. The player's behaviour — `radio-suite/components/embed/EmbedPlayer.tsx`

Rewrite in plain JS, keeping this behaviour list (all checked in Radio Suite):

- Header: title (default the station's name), icon, light/dark button (**outline**
  sun/moon — the solid sun read as a settings gear).
- Show picker (listbox: button keeps focus, arrows/Enter/Escape), shown only with >1 show.
  `show=` picks the **starting** show; the picker stays.
- Show info: cover, title, host, description (3 lines, Read more), episode count, latest date.
- Episode rows: cover, title, date · length, description toggle, download, play/pause.
- Player bar (flex child at the bottom, not `position: fixed` — works in any iframe
  height): title, show, seek with buffered bar, −15 s / +30 s, speed menu, mute + volume,
  download, close. **Plays on to the next episode in the list as shown.**
- **One `<audio>` element for the whole player** (episodes only). If a live button is
  ever added, read [../live-audio-pattern.md](../live-audio-pattern.md) first — live uses a
  fresh element per play here.
- `episode=` opens that episode in the bar and scrolls to it, **without autoplay**
  (browsers block sound before a click).
- Errors: show a short toast; log, never swallow (CLAUDE.md §3).
- Narrow (≤560 px): player bar stacks; volume slider hidden. Checked at 320 and 375 px
  **inside a real iframe** — headless Chrome won't size a window under ~500 px, so a plain
  narrow screenshot looks cut off when it isn't.

### 2e. The generator — `radio-suite/components/EmbedGenerator.tsx`

The fund drive studio card already has preview + snippet + Copy + Open. Extend that
pattern rather than copying Radio Suite's page:

- Sections: What it shows (starting show, order, latest N, picker order) · Look (theme,
  part toggles) · Branding (title, two accent colours with picker + hex field) · Size
  (width %/px, height).
- Live preview iframe with **Desktop / 768 / 375** buttons; reload it **400 ms after the
  last change** (typing a title otherwise reloads it per key).
- Copy reports failure honestly ("Copy blocked — select and copy"); the code box is
  `select-all`.
- A notice when the embed can't work for outside visitors (in Radio Suite: the login).

---

## 3. Rules that carry over (the bugs we already paid for)

| Rule | Radio Suite's case |
| --- | --- |
| The embed shows exactly what the feeds/app show — reuse the app's own rule, never a second query | Built its own routes on `lib/api/visibility.ts`; music shows' newest 2 only. **Here: read `/api/archive`**, so withheld shows and dropped recordings stay out |
| Match paths by whole segment | `/embeds` (admin) must not count as `/embed`; old code's `startsWith('/listen')` also matched `/listening` |
| No server file paths in answers; link audio per episode | Here audio URLs are Pacifica's public ones already — nothing to hide |
| Test every value of every setting through generator → link → player | 300 random combinations + each value alone; one example would not catch a dropped field |
| Run each new check against the unfixed code first | Same as this repo's CLAUDE.md §3a |

---

## 4. Decisions for Paul (before building)

1. **Who may frame it?** The fund drive allows this app + kpfk.org + www.kpfk.org only.
   A podcast player for "other websites" may need more (other Pacifica stations, partner
   sites) or `*`. Same `embedAncestors()` mechanism either way.
2. **Which shows?** All of `/api/archive`, or Talk only (as the mobile app)?
3. **Address:** `/embed/podcasts` (next to `/embed/fund-drive`)?
4. **Look:** Radio Suite's look (podcast-feed style) or this app's design system?
5. **Counts:** do embed plays count in the studio's usage counters (`/api/ev`)?
6. **Download:** episodes play from Pacifica hosts; the HTML `download` attribute is
   ignored cross-origin, so the button would open the MP3 rather than save it — keep it,
   or drop it?
   *(Radio Suite dropped its download buttons later on 2026-11-10 — Paul's call. Same
   default here unless decided otherwise.)*

---

## 5. Suggested phases

1. **Settings contract** — port 2a + 2b with their tests (`test/pacifica/`): defaults ⇄
   empty link, every value round-trips, bad values fall back one at a time, iframe code
   escaping, `textOn` ≥ 3:1 for every grey, "latest N" in every order.
2. **Embed page** — `embed/podcasts.html` + `public/podcast-embed.js` + CSS; route in
   `server.js` through `sendEmbed()` (its own `frame-ancestors`, `media-src` as the app).
   **Public on its own:** Radio Suite added `EMBEDS_PUBLIC` + `EMBED_ALLOWED_SITES` so the
   embed could be opened without opening the rest (its `lib/public-paths.ts`). Here the
   site is already public; the per-embed `frame-ancestors` (`embedAncestors()`) is the part
   that matches `EMBED_ALLOWED_SITES`.
   **Add the file to the Dockerfile's copied folders** if it lives anywhere new
   (`test/pacifica/dockerfile.test.js` fails otherwise). Tests: CSP/frame headers; the
   page in `test/page-load`; a browser run at 320/375/1280 px in light and dark, real taps
   on play (per `test/listen-live/run.sh`); the stylesheet specificity check.
3. **Studio card** — the generator (2e) next to the fund drive card, with preview and Copy.
4. **Docs** — HANDOFF entry, this file moved to the docs index's built list, overview PDF
   if it changes visibly.

## Files in Radio Suite to read while porting

| Radio Suite file | What to take |
| --- | --- |
| `lib/embed-options.ts` | Settings contract (2a) |
| `lib/embed-view.ts` | Ordering, formatting (2b) |
| `components/embed/embed-player.css` | Look (2c) |
| `components/embed/EmbedPlayer.tsx` | Behaviour (2d) |
| `components/EmbedGenerator.tsx` | Studio card controls (2e) |
| `tests/embed-options.test.ts` | Tests to port (round-trip, fallbacks, escaping, contrast, stylesheet) |
| `lib/public-paths.ts` | Segment matching (`isUnder`) |
