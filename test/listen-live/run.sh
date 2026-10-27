#!/bin/sh
# Listen Live page (/live) in headless Chrome, real taps (listen-live.cjs). Run before every
# push that touches the page. Starts its OWN scratch server (port 8091, copy of
# ./data without stats/) and a muted Chrome (port 9233), and removes both after.
# APP=<url> targets an already-running server instead (e.g. an old build, to show a failure).
cd "$(dirname "$0")"
HERE="$PWD"
ROOT="$(cd ../.. && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME"; exit 1; }
SCRATCH=""; SERVER_PID=""
cleanup() {
  pkill -f "listen-live-chrome-profile" 2>/dev/null || true
  i=0; while pgrep -f "listen-live-chrome-profile" >/dev/null && [ $i -lt 20 ]; do sleep 0.25; i=$((i + 1)); done
  rm -rf "$HERE/listen-live-chrome-profile" "$HERE/chrome.log"
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$SCRATCH" ] && rm -rf "$SCRATCH"
}
trap cleanup EXIT
cleanup
if [ -z "$APP" ]; then
  if lsof -nP -iTCP:8091 -sTCP:LISTEN >/dev/null 2>&1; then echo "port 8091 is busy — stop what is on it, or pass APP=<url>"; exit 1; fi
  SCRATCH="$(mktemp -d)"
  [ -d "$ROOT/data" ] && cp -R "$ROOT/data/." "$SCRATCH/"
  rm -rf "$SCRATCH/stats"      # never count test page views
  (cd "$ROOT" && PORT=8091 DATA_DIR="$SCRATCH" exec node tools/start.js > "$SCRATCH/server.log" 2>&1) &
  APP="http://127.0.0.1:8091/"
  i=0
  until curl -sf -m 2 "${APP}healthz" | grep -q '"basis":"schedule"'; do
    i=$((i + 1)); [ $i -gt 90 ] && { echo "scratch server did not settle:"; tail -20 "$SCRATCH/server.log"; exit 1; }
    sleep 1
  done
  SERVER_PID="$(lsof -nP -tiTCP:8091 -sTCP:LISTEN | head -1)"
fi
export APP
"$CHROME" --headless=new --mute-audio --remote-debugging-port=9233 \
  --user-data-dir="$HERE/listen-live-chrome-profile" --no-first-run --no-default-browser-check \
  --disable-gpu --window-size=1400,1000 about:blank > chrome.log 2>&1 &
i=0
until curl -sf -m 1 http://127.0.0.1:9233/json/version >/dev/null; do
  i=$((i + 1)); [ $i -gt 30 ] && { echo "Chrome did not open port 9233:"; cat chrome.log; exit 1; }
  sleep 0.5
done
# The test's own exit status, not grep's: a pipe would report success for a failing run.
CDP_PORT=9233 node --experimental-websocket listen-live.cjs > listen-live.out 2>&1; status=$?
grep -v ExperimentalWarning listen-live.out | grep -v 'Use `node'; rm -f listen-live.out
exit $status
