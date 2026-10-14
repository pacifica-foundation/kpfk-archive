# Data sources for a new station — notes (2026-10-13)

**Decision (Paul, 2026-10-13): keep it simple. The studio's Data sources card stays read-only.**
Each station is its own deployment at its own address, and its feeds never change on a running
site. So they are set by hand in that station's file when the app is duplicated, not in the studio.
(An in-studio editor with a Test button was built the same day and dropped as over-engineered.)

## Duplicating the app for another station (e.g. KPFA)

1. Copy `stations/kpfk.json` to `stations/<id>.json`. Change `id`, `primaryChannel`, `name`,
   `frequency`, `city`, `timezone`, `feeds.catalog`, `feeds.channels`, `liveStream`, `siteUrl`,
   links, socials and assets.
2. `origins` must list every host the station uses: `feeds` = the feed host; `audio` = the
   episode mp3 host, the channel `listenUrl` host and the live stream host; `artwork` = the hosts
   of show `photoUrl`s in the catalog. Look in the station's catalog and channels JSON for these.
3. Check it locally before deploying:
   `STATION_PROFILE=stations/<id>.json PORT=8092 DATA_DIR=/tmp/<id>-data node server.js`, then
   `curl -s localhost:8092/healthz` should show `ready:true`, `archiveFilter.basis:"schedule"`.
4. In Coolify: a new app from the same repo, `STATION_PROFILE=stations/<id>.json` (env), its
   own named volume at `/app/data`, its own `STUDIO_PASSWORD`, its own domain. See
   [DEPLOYMENT.md](DEPLOYMENT.md).
5. Name, logo, side-menu links and socials can then be adjusted in the studio as today.

## Facts found while looking (still true)

- Feeds, stream and time zone are read once at boot (data service, live proxy, `STATION_TZ`).
- Saved feed snapshots record their source address and are rejected on a mismatch
  (`lib/pacifica/service.js`), so a changed feed never serves the old station's data.
- Redirects are re-checked against the allowed hosts at every hop (`lib/pacifica/fetch-json.js`).
