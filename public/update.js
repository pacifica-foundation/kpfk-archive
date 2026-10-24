/* Keeps an open page on the current build (Paul, 2026-10-23).
 *
 * Why: a deploy replaces the server, not the pages already open. A phone can keep a page alive
 * for days, and a page loaded during the deploy can get its HTML from the new server and
 * /station.js from the old one. On 2026-10-23 that mix crashed the Transcript panel (new code
 * reading a setting the old file lacked) until Paul reloaded by hand. Listeners will not know to.
 *
 * What: the page knows its build (<meta name="app-version">, stamped by server.js) and the
 * build of its settings file (window.AppBuild, from /station.js). It compares them at load, and
 * compares its build with /api/version whenever the listener comes back to the page, every few
 * minutes while it is on screen, and when the network returns. When they differ:
 *   - nothing playing and the listener is just arriving (load, back to the tab) → reload now;
 *   - otherwise (audio playing, or they are reading the page) → a banner offers Reload, and the
 *     page reloads by itself the next time they come back to it with nothing playing.
 * It never reloads under a playing episode or stream, and never while the page is in the
 * background (a phone's lock-screen controls would vanish). Places in episodes are already kept
 * (app.js saves on pause and on pagehide), so a reload loses nothing.
 */
(function(){
  'use strict';
  var meta = document.querySelector('meta[name="app-version"]');
  var mine = meta ? meta.content : '';
  // The file opened straight off disk has no stamped build and no server to ask.
  if(!mine || /\{\{/.test(mine)) return;
  var CHECK_MS = 5 * 60 * 1000;
  var LOOP_MS = 2 * 60 * 1000;
  var KEY = ((window.StationConfig || {}).storagePrefix || '') + 'updateReload';
  var wanted = '';          // the build a reload should bring; '' = up to date
  var dismissed = '';       // the build whose banner the listener closed
  var banner = document.getElementById('updateBanner');
  var lastCheck = 0;

  function soundOn(){
    var app = window.ArchiveApp;
    return !!(app && app.soundOn && app.soundOn());
  }
  // A reload that brings the same mismatch back (the old and new servers both answering during
  // a deploy) must not repeat forever: one automatic reload per target build every LOOP_MS, then
  // the banner. sessionStorage can throw (private mode, blocked storage); without it the guard
  // is off, and the worst case is the reloads the guard exists to limit, so it is caught and
  // reported rather than allowed to stop the update check.
  function reloadedRecently(target){
    try {
      var last = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      return !!(last && last.to === target && Date.now() - last.at < LOOP_MS);
    } catch(e){ console.warn('Update check: no session storage for the reload guard:', e.message); return false; }
  }
  function noteReload(target){
    try { sessionStorage.setItem(KEY, JSON.stringify({ to: target, at: Date.now() })); }
    catch(e){ console.warn('Update check: no session storage for the reload guard:', e.message); }
  }
  function reload(){
    noteReload(wanted);
    location.reload();
  }
  function paintBanner(){
    if(!banner) return;
    banner.hidden = !wanted || dismissed === wanted || document.hidden;
  }
  // arriving: the listener just loaded the page or came back to it, so a reload is the moment
  // they would not notice. Any other time the banner asks instead.
  function offer(target, arriving){
    wanted = target;
    if(arriving && !document.hidden && !soundOn() && !reloadedRecently(target)){ reload(); return; }
    paintBanner();
  }
  function check(arriving){
    if(document.hidden) return;
    if(wanted){ offer(wanted, arriving); return; }
    lastCheck = Date.now();
    fetch('/api/version', { cache: 'no-store' }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(j){
      if(j && typeof j.version === 'string' && j.version && j.version !== mine) offer(j.version, arriving);
    }).catch(function(e){
      // Offline, or mid-deploy: the next check (focus, timer, network back) tries again.
      console.warn('Update check failed:', e.message);
    });
  }

  if(banner){
    document.getElementById('updateReload').addEventListener('click', reload);
    document.getElementById('updateDismiss').addEventListener('click', function(){ dismissed = wanted; paintBanner(); });
  }
  // A settings file from another build: the mix that broke Transcript on 2026-10-23.
  if(window.AppBuild !== mine) offer(window.AppBuild || 'unknown', true);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) check(true); else paintBanner(); });
  // Restored from the back-forward cache (iPhone Safari does this a lot): no load event runs.
  window.addEventListener('pageshow', function(e){ if(e.persisted) check(true); });
  window.addEventListener('online', function(){ check(false); });
  setInterval(function(){ if(Date.now() - lastCheck >= CHECK_MS) check(false); }, 30000);
  // For the browser test (test/homepage/update.cjs): ask now, as a timer tick would.
  window.AppUpdate = { check: check, wanted: function(){ return wanted; } };
})();
