# Transcripts — how they reach a listener, and every way they have broken

**Current** (2026-10-24). Read this before changing anything in the Transcript path, and when a
listener (or Paul) reports "transcripts don't load". Transcripts have broken in production
several times, each for a different reason. Each one is listed below with its test.

**First stop when something looks wrong:** `curl -s https://podcast.kpfk.org/api/plugins/qir/status`.
Its `recent` list holds the last 20 QIR problems with their times (failed requests with QIR's
error, "QIR is behind" warnings, recoveries), newest first. It's kept in memory, so a redeploy
empties it. Nobody needs to dig through Coolify logs.

## How a transcript reaches the listener

```
Listener taps Transcript
  → public: plugins/discovery/public/along.js   GET /api/plugins/qir/transcript/<qir id>
  → server: plugins/discovery/index.js          checks the id is in our copy of QIR's episode list
  → plugins/discovery/lib/qir/service.js        transcript(id) → request('/episodes/<id>/transcript', {listener:true})
  → QIR (https://qir.kpfk.org/api/v1, Ace's service, key QIR_API_KEY in Coolify only)
```

Our server keeps **two separate things** from QIR:

| | What | When | If QIR fails |
|---|---|---|---|
| **Episode list** | headlines, summaries, which episodes QIR has | a timer every 5 min, visitors or not: a "what changed" read, and a full reload once the copy is an hour old (since 2026-10-25; before that only when a visitor's request asked) | the last good copy keeps being served (it goes stale); retried after a 30 s pause, or longer if QIR sends Retry-After |
| **Transcript** | the text for one episode | when a listener asks; the 30 most recent are kept in memory | that one request fails (503); nothing else is affected |

**These must stay independent.** A failing list refresh must never stop transcripts loading
(that was the 2026-10-24 outage). The only link between them: a transcript is served only for
an episode already in our copy of the list.

**Backlog after a QIR outage:** nothing to do by hand. When QIR answers again, the next refresh
reloads the whole list and then reads everything changed since the last good copy. Every
episode QIR processed during the outage appears then. The tests "episodes missing from a frozen
listing arrive via updated_since…" and "polls reach new episodes through a QIR cache that never
expires…" in `plugins/discovery/test/qir.test.js` cover this.

**What the page says:**
- 404 from our server → "There is no transcript for this episode yet." (QIR has none.)
- anything else (503) → "The transcript service is unavailable. Try again shortly."

## When transcripts fail — what to check, in order

1. **QIR's status as our server sees it:** `curl -s https://podcast.kpfk.org/api/plugins/qir/status`
   - `state: "ready"` → the list is fine. Look at the listener's browser (steps 3–4).
   - `state: "unavailable"` → the list refresh is failing. **`cause`** says which QIR address
     and why (e.g. `/episodes: Upstream HTTP 502`, `/shows: timed out`). `lastSuccess` (ms since
     1970) is the last good list. Transcripts should **still load** in this state. If they don't,
     QIR's transcript service is down too, and that's on QIR's side.
   - `error` starting `invalid_` / `provider_data_invalid` → QIR changed what it sends; that's
     a code question, not an outage.
2. **Try one transcript yourself:** take a `qir` id from `/api/plugins/qir/notes` and
   `curl -s -o /dev/null -w '%{http_code}\n' https://podcast.kpfk.org/api/plugins/qir/transcript/<id>`.
   200 = working. Repeat a few times; failures that come and go point at the server.
3. **The listener's console:** a JavaScript error (not a 503) means a browser-side problem:
   see the 2026-10-23 and 2026-10-15 incidents.
4. **Server log** (only if `recent` isn't enough, e.g. after a redeploy): every failed QIR request is logged as
   `[qir] request failed — <address>: <cause>` (`listener` in the line = a transcript request).
5. **Tell Ace only if** QIR stays down: note it, recheck the next day, email only if it's still broken.

## Incidents

### 2026-10-25 — about 7 recent shows had no headline until a few clicks later (server)
- **Seen:** Paul opened the site in the morning; recent shows had no headline ("Transcript
  pending"). After a few clicks the headlines and transcripts appeared. The log had
  `QIR is behind: 8 recent station episode(s) not processed, oldest 16.7 h ago` and no failed
  transcript requests overnight. QIR's own records show those shows processed within minutes
  of airing.
- **Root cause (ours, since the start):** the episode list refreshed **only when a visitor's
  request asked for it**, and that request was answered from the old copy while the refresh
  ran in the background. After a quiet spell the first visitor always saw an old list. Their
  clicks finished the refresh, which is why it "fixed itself".
- **Fix:** `qir.start()` (started by the plugin's `warm()` at boot) refreshes the list and
  rebuilds the notes every 5 minutes with no visitor needed. It pauses while QIR is switched
  off in the studio, and starts even if QIR is down at boot. Status gained `recent` (above).
- **Tests:** `qir.test.js` "with no visitors the catalog stays current (change poll / full
  reload)…" and "the timer pauses while QIR is switched off, and status keeps timed problems…";
  `server.test.js` "after warm-up QIR is refreshed every 5 minutes with no visitors". All fail
  on the old code.
- The Pacifica feeds don't have this problem: a visitor past the refresh time waits for fresh
  data instead of being given the old copy.

### 2026-10-24 — "The transcript service is unavailable", on and off (server)
- (Follow-up 2026-10-25: a `fetch failed` pair in the log, one transcript and one list read at the
  same moment, was a brief network blip reaching QIR. Fine on retry.)
- **Seen:** 503s from `/api/plugins/qir/transcript/…`. Our status said `unavailable` and the last
  good list was from 20:22 UTC. Between failures, transcripts loaded fine.
- **Trigger (QIR's side):** from about 21:22 to 22:17 UTC, QIR failed our hourly list refresh.
  It recovered on its own; the backlog filled in at once.
- **Root cause (ours, since 2026-09-24):** every failed QIR request set one shared 30 s pause
  that refused **all** QIR requests, transcripts included. The refresh was retried on every
  visit, failed again, and paused everything again, so listeners kept landing in the pauses.
  The code also discarded QIR's error, so we could not see why the refresh failed.
- **Fix (commit `bda6760`, live 2026-10-24):** the pause applies to the background list refresh
  only. A transcript request always goes to QIR, and a failed one never pauses anyone else.
  QIR's error is logged and shown as `cause` in the status.
- **Test:** `qir.test.js` "a failing background refresh (HTTP 502 / 429 with Retry-After /
  timeout) never refuses a listener's transcript". Fails on the old code with the live error.
- An earlier sign was noted on 2026-10-23 (one transcript 503 then a 30 s block) and left as
  "worth a fix". Don't defer this kind of note again.

### 2026-10-23 — Transcript did nothing (browser, after a deploy)
- **Seen:** console `Cannot read properties of undefined (reading 'transcriptNote')`.
- **Root cause:** an open page mixed builds: new `along.js` with an old `/station.js`.
- **Fix:** pages notice a deploy and reload at a safe moment (`public/update.js`); `along.js`
  copes with an old settings file. Tests: `test/pacifica/app-version.test.js`,
  `test/homepage/update.cjs`. Details in HANDOFF.

### 2026-10-15 — Transcript button did nothing with a popup open (browser, iPhone)
- **Root cause:** the panel opened underneath the popup; then, on iPhones, a late history step
  closed it again.
- **Fix:** `ArchiveApp.closePopups(then)` closes popups and waits for the history step.
  Test: `test/homepage/listen-along-popups.cjs` (includes "slow phone").

### 2026-09-30 — QIR stopped processing for a few hours (QIR's side)
- New episodes had no headline or summary; status showed `pending`, `behindHours` 3.2. Existing
  transcripts kept working. QIR caught up by itself the next day. No change on our side.

## Rules
- Keep the list refresh and transcript requests independent (see above).
- Never hide a QIR failure: keep its cause in the log and status. No bare `catch`.
- A change in this path ships with a test that fails on the old code.
