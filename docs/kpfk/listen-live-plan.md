# Listen Live page — plan (INT-966)

**Started 2026-10-23.** From Ace's review ("Podcast App Feedback (KPFK, for Paul)", Google Doc,
section "Listen Live page (highest priority)"). Order, as for the Show view: inventory → what's
wrong → plan and Paul's decisions → clickable mockup with real KPFK data → build → real-tap browser
test → push for Paul's phone test.

Interim (live since 2026-10-23, `ba9bce0`): `/live` opens the existing Live popup. This page takes
that address over.

## 1. Inventory — what exists today

**The Live popup** (`#livePlayer`, `public/index.html` ~499; painted by `paintLivePlayer()` in
`public/app.js`):

| Part | Where it comes from |
|---|---|
| "Live · KPFK 90.7 FM" badge | station profile |
| Show art (tap → "About this show" panel) | `/api/nowplaying` `current.photo` |
| Title, "with" host, times ("8:00 a.m. – 9:00 a.m.") | `/api/nowplaying` `current` |
| Past episodes button with count | archive rows (`episodesFor`) |
| Play/stop, volume (desktop) | the live audio element, built per play (docs/live-audio-pattern.md) |
| Up next (tap → that show) | `/api/nowplaying` `next` |
| Now playing song (music shows) | `/api/nowplaying` `current.song/artist` |
| Status note ("Tap play to tune in", "Paused") | live audio state |
| Stream-failure alert with retry | `#lpAlert` |

Also: the player bar's live mode (`barMode = 'live'`), the header's On Air button, Media Session
(lock screen), the schedule's live row (choice dialog: Listen Live / Past episodes).

**Data the page can use, no new feeds:** `/api/nowplaying` (current + next, rolls over on its own
poll), `/api/schedule` (published Confessor schedule — today's slots with names, hosts, art,
category), `/api/archive` (show descriptions and latest episodes).

**Not in the app yet (station file, INT-968):** call-in line, office line, studio email,
Text/WhatsApp, signal list, app link. KPFK's current player (kpfk.org/player) shows: Call Studio
(818) 985-5735, Office (818) 985-2711, Text/WhatsApp, Email the studio, signals 90.7 Los Angeles,
98.7 Santa Barbara, 93.7 N. San Diego, 99.5 Ridgecrest/China Lake. The email address and WhatsApp
number are filled in by Aiir's script — **ask Ace for both.**

## 2. What's wrong (Ace)

- The popup has no address of its own (fixed in the interim) and sits over the explore page.
- "Tap play to tune in" is a second click after Listen Live on kpfk.org.
- kpfk.org/player has the call-in line, studio email and signals but no donate, schedule, or link to
  the show and its episodes; our popup has the show and episodes but none of the station contacts.

## 3. The page

One address, `/live`, three layouts by width (Ace's wireframes A–C):

- **Compact (popup or phone, under ~600px):** LIVE tag; large art; title, hosts, time; play with
  volume and Expand; Show page · Past episodes · Donate; next two shows + Full schedule; call-in
  and Email the studio; on phones only, "Listen in the KPFK app".
- **Full window (~900px and up):** station header (logo; Schedule, Podcasts, Donate); left column:
  LIVE tag, art beside title, hosts, description, Show page / Past episodes, the player, "Latest
  from this show"; right column: Today's schedule with the current show highlighted; footer strip:
  call-in, office, Email the studio, signals.
- **Fund drive on (INT-967):** red banner on top, smaller art, the station's embed slot under the
  player, a large Donate button.

Behaviour:

1. **One click to audio.** Try to play on load; when the browser refuses (Safari usually does on a
   fresh page), the only thing in the way is one large play button. Uses the existing live audio
   (never reuse the element; never branch on `paused`).
2. **Rolls over by itself** at the top of the hour: show, art, up next and the schedule highlight,
   from the existing now-playing poll. No reload.
3. **Expand** (compact layout only): opens `/live` in a full tab and stops the stream in the
   small window, so the two never play at once. The full tab tries to play; if refused, one tap.
4. **Show page / Past episodes / Latest** open the existing show sheets in place, so the stream
   keeps playing (the player bar rule).
5. **Today's schedule** from Confessor via `/api/schedule`, never Aiir.
5a. **Now playing song** (from the feed's track, as the Live popup and player bar show it today):
   a "♪ Now playing — song · artist" line under the player whenever the feed carries one, gone when
   it clears; the player bar's second line shows it too. Doubled "feat." already cleaned (INT-965).
6. **Contacts and signals** from the station file (INT-968), so every Pacifica station gets them.
7. **Phones:** a light "Listen in the KPFK app" prompt, links from the station file.
8. **Optional, later:** pop-out mini player (Chrome/Edge Document Picture-in-Picture only).

## 4. Decisions (Paul, 2026-10-23)

1. **Part of the app.** `/live` is a full-page view in the same app: one live player, show and
   episode links open in place without stopping the stream, the player bar stays.
2. **Fund drive: slot now, build next.** The layout leaves room for the banner and embed; the
   module is INT-967.
3. **The Live popup stays in the app.** The On Air button and the schedule's live row keep opening
   the popup for people already browsing; `/live` is the page for links from kpfk.org and social.
4. **Studio email and WhatsApp:** kpfk.org/player loads both from Aiir's live data per show (not in
   its HTML), and the app does not scrape Aiir, which is being retired. Placeholders until Ace
   sends them; they go in the station file (INT-968).

5. **Dark mode card borders (2026-10-23):** stronger on this page only — card border 20% (site: 10%),
   dividers 30% (site: 22%). Rest of the site's dark mode unchanged for now.

## 5. Tests (to write with the build)

Real taps in Chrome and WebKit at 390 / 420 / 768 / 1280, light and dark: arrive at `/live` →
one tap at most to audio; Back and close never leave the site; rollover with a mocked clock;
Expand stops the small window; show links keep the stream playing; the player bar always visible;
autoplay refused → one big button, the refusal logged (never swallowed).

## 6. Build phases (Paul, 2026-10-23)

Each phase ends the same way: tests (offline, plus real-tap browser checks at phone and desktop,
Chrome and WebKit, light and dark, each shown to fail on the old code) → commit → Paul OKs the push
→ Paul redeploys → checked live → tracker updated. Nothing in a later phase is started before the
earlier one is live.

**What the studio has today** (Station & appearance, `lib/station-overrides.js`): station name,
frequency, city, logo, side-menu links, social accounts — instant, with history, undo and the
Import / Export backup. Plus the Discovery and transcript switches. Feeds, timezone and identity
stay file-only on purpose.

### Phase 1 — Station settings: Contact and Wording (INT-968, first half)

- Station file (`stations/<id>.json`) gains an optional **contact** block: studio call-in line,
  office line, studio email, WhatsApp/text, signal list, app link. Each optional; a blank one is not
  shown. Validated in `lib/station-config.js` (phone digits, email shape, https links).
- **Studio, Station & appearance** gains two groups using the existing overrides (same checks,
  history, undo, backup): **Contact** (the fields above) and **Wording** (the home page paragraph
  and the transcript note, `copy.*`, added 2026-10-23).
- Listeners see nothing new yet. KPFK's values: call-in (818) 985-5735, office (818) 985-2711,
  signals 90.7 Los Angeles · 98.7 Santa Barbara · 93.7 N. San Diego · 99.5 Ridgecrest/China Lake,
  app link kpfk.org/app. Email and WhatsApp left blank until Ace sends them.

### Phase 2 — The Listen Live page (INT-966)

- `/live` becomes the page in the approved mockup, inside the app (the home page hidden behind it):
  compact layout for popups and phones, full-window layout from ~900px, Expand between them.
- One click to audio: play is tried on arrival; a refusal (Safari) leaves one large Play button, and
  the refusal is logged. The existing live audio code (built per play, never reused).
- Rolls over at the top of the hour from the now-playing poll; today's schedule from Confessor;
  "Now playing" song line; Show page / Past episodes / latest episodes open in place without stopping
  the stream; contacts and signals from Phase 1; "Listen in the KPFK app" on phones; the player bar
  always visible; stronger dark card borders on this page only.
- The Live popup stays for the On Air button and the schedule's live row.
- A fund drive banner/embed **slot** in the layout, empty until Phase 4.
- Then Ace points kpfk.org/listen and Aiir's player at `/live` (INT-980).

### Phase 3 — Site footer (INT-968, second half)

- A footer on the home page from the same settings: station line, call-in and office numbers,
  signals, donate, socials, privacy, app links, optional public file link (new optional link).

### Phase 4 — Fund drive mode (INT-967)

- A **Fund drive screen in the studio** (Paul, 2026-10-23: a full screen, not just Ace's "admin
  toggle"), no deploy: on/off, banner text, donate link (defaults to the Donate menu link, used by
  every donate button), the embed (URL or snippet), and a live preview of the banner and Listen Live
  layout before switching on. Same history, undo and backup as Station & appearance.
- While on: the red banner on Listen Live and show pages, the embed under the player, the large
  Donate button. Ace builds KPFK's embed (goal progress, thank-you gift).

### Phase 5 — Schedule finish (INT-969, rest)

- The schedule's live row: its main tap opens Live (the popup, in the app), with a small separate
  Past episodes link — no choice dialog.
- The schedule's show card gets Show page and Past episodes buttons, plus Listen Live when on air.

### After these

Search fixes (INT-970), episode count and duplicate audio (INT-974), missing-art and host fallbacks
(INT-975); chapters (INT-971) when Ace's Making Contact MP3 arrives.

### Needed from Ace

Studio email address and WhatsApp/text number (before Phase 2 ships, or those lines stay hidden);
the fund drive embed (Phase 4); the Making Contact MP3 (chapters).
