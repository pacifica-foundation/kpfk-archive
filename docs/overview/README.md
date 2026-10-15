# KPFK Archive website — overview PDF (for Pacifica leadership)

[KPFK-Archive-Website-Overview.pdf](KPFK-Archive-Website-Overview.pdf): a plain-language, illustrated
overview of podcasts.kpfk.org for the Executive Director and staff (first made 2026-10-15). The
companion to the app's overview (`~/Desktop/kpfk-podcast/docs/overview/`) — same layout and fonts.

Nine pages: cover; programs and the player / Listen live; Listen along and search; the schedule list
and the week grid; **what makes it dynamic** (the automatic headline, summary, guests and time-marked
transcript after every broadcast, in plain words); phone, tablet and computer side by side; **the
studio** (sign-in and dashboard; Import / Export, printable report and settings); the station's rules,
where it stands and what's next. Sixteen screenshots: listener pages at phone (390 px), tablet (834 px)
and computer (1440 px), light and dark mixed; the studio at computer size only (Paul). `ONLY=desktop-extra`
retakes just the computer Listen live and schedule-list pictures.

## Regenerate

1. **Screenshots** from the live site, headless WebKit (the iPhone/iPad engine). The usage beacon
   (`/api/ev`) is blocked, so these visits never reach the station's stats. Playwright is not a
   dependency of this app — run it from a scratch folder (~2 min):
   ```sh
   (mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright && npx playwright install webkit)
   NODE_PATH=/tmp/pw/node_modules node docs/overview/capture.cjs https://podcasts.kpfk.org
   ```
   PNGs land in `docs/overview/raw/` (git-ignored). The featured program is Democracy Now!
   (`SHOW` in capture.cjs); its newest episode is used, so the transcript is real.

   **1b. Studio** (`capture-studio.cjs`): the live studio's password is only in Coolify (never read
   it), so the studio is captured from a **scratch server** on 8091 with a throwaway password and a
   **copy** of a data folder — its stats are example figures, and the captions say so. The script
   refuses any kpfk.org address. Never use port 8081 or the real data folder:
   ```sh
   cp -R data/. /tmp/ov-data/ && PORT=8091 DATA_DIR=/tmp/ov-data STUDIO_PASSWORD=throwaway node tools/start.js &
   NODE_PATH=/tmp/pw/node_modules STUDIO_PASSWORD=throwaway node docs/overview/capture-studio.cjs
   ```
   Used: `studio-login-light`, `studio-top-dark`, `studio-export-dark`, `studio-report-light`. Not used:
   the settings tab (a scratch server says "No QIR key", untrue live).
2. **Shrink** into `img/` as JPEG 82 — phone 1100 px, tablet 1400 px, computer and studio 1800 px:
   `sips -Z 1100 raw/phone-home-light.png --out t.png && sips -s format jpeg -s formatOptions 82 t.png --out img/phone-home-light.jpg`
3. **PDF** (Letter, the bundled Oswald and Nunito in `fonts/`, OFL):
   ```sh
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
     --no-pdf-header-footer --allow-file-access-from-files --virtual-time-budget=10000 \
     --print-to-pdf="$PWD/docs/overview/KPFK-Archive-Website-Overview.pdf" "file://$PWD/docs/overview/overview.html"
   ```
   Then look at every page (`pdftoppm -r 45 -png …`): two features a page, nothing stranded alone.

Claims in the text are kept to what was checked on 2026-10-15 (live counts: 106 programs, ~1,190
episodes, a QIR transcript for every talk episode in the archive that day; "nearly every" allows for
the newest few hours). No accessibility-conformance claims until audited.
