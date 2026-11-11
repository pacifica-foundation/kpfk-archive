#!/bin/sh
# Podcast player embed and the studio's Embeds tab in headless Chrome, real taps (podcast-embed.cjs):
# the player at /embed/podcasts (picker, play, bar, speed, skip, plays on, link settings, narrow
# widths), framed by another website, and the code maker in the studio. Starts its OWN scratch
# server (port 8094, copy of ./data without stats/, studio password "pw") and a muted Chrome
# (port 9235); removes both after. APP=<url> STUDIO_PW=<password> targets a running server instead.
# Plays real episodes from the station's audio host, muted: it needs the internet.
cd "$(dirname "$0")"
HERE="$PWD"
ROOT="$(cd ../.. && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME"; exit 1; }
SCRATCH=""; SERVER_PID=""
cleanup() {
  pkill -f "podcast-embed-chrome-profile" 2>/dev/null || true
  i=0; while pgrep -f "podcast-embed-chrome-profile" >/dev/null && [ $i -lt 20 ]; do sleep 0.25; i=$((i + 1)); done
  rm -rf "$HERE/podcast-embed-chrome-profile" "$HERE/chrome.log"
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$SCRATCH" ] && rm -rf "$SCRATCH"
}
trap cleanup EXIT
cleanup
if [ -z "$APP" ]; then
  if lsof -nP -iTCP:8094 -sTCP:LISTEN >/dev/null 2>&1; then echo "port 8094 is busy — stop what is on it, or pass APP=<url>"; exit 1; fi
  SCRATCH="$(mktemp -d)"
  [ -d "$ROOT/data" ] && cp -R "$ROOT/data/." "$SCRATCH/"
  rm -rf "$SCRATCH/stats"   # never count test plays
  (cd "$ROOT" && PORT=8094 STUDIO_PASSWORD=pw DATA_DIR="$SCRATCH" exec node tools/start.js > "$SCRATCH/server.log" 2>&1) &
  APP="http://127.0.0.1:8094/"; STUDIO_PW=pw
  i=0
  until curl -sf -m 2 "${APP}healthz" | grep -q '"basis":"schedule"'; do
    i=$((i + 1)); [ $i -gt 90 ] && { echo "scratch server did not settle:"; tail -20 "$SCRATCH/server.log"; exit 1; }
    sleep 1
  done
  SERVER_PID="$(lsof -nP -tiTCP:8094 -sTCP:LISTEN | head -1)"
fi
export APP STUDIO_PW
"$CHROME" --headless=new --mute-audio --remote-debugging-port=9235 \
  --user-data-dir="$HERE/podcast-embed-chrome-profile" --no-first-run --no-default-browser-check \
  --disable-gpu --window-size=1400,1000 about:blank > chrome.log 2>&1 &
i=0
until curl -sf -m 1 http://127.0.0.1:9235/json/version >/dev/null; do
  i=$((i + 1)); [ $i -gt 30 ] && { echo "Chrome did not open port 9235:"; cat chrome.log; exit 1; }
  sleep 0.5
done
# The test's own exit status, not grep's: a pipe would report success for a failing run.
CDP_PORT=9235 node --experimental-websocket podcast-embed.cjs > podcast-embed.out 2>&1; status=$?
grep -v ExperimentalWarning podcast-embed.out | grep -v 'Use `node'; rm -f podcast-embed.out
exit $status
