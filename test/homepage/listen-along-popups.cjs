// The player bar's Transcript / Songs button with a popup open (Paul, 2026-10-15: "transcripts
// does not work with some views"). The bar sits above every popup (z-index 310) so its button
// stays tappable, but the Listen along panel is layered under popups (z-index 90): it opened
// invisibly beneath a show sheet, an episode, Now Playing, the schedule, the menu, Donate or the
// artwork zoom. The button now closes popups first (ArchiveApp.closePopups). For each popup: play,
// open it, tap the bar's button — the panel must be the top layer and no popup left open — then
// Back closes the panel and nothing comes back. Songs (station cue files) make the button appear
// without a QIR key. Shown to fail on the code before the fix (every popup but none covered it).
// Live browser check against a running app (default :8081 — use the 8091 scratch server),
// Chrome remote debugging on CDP_PORT (default 9231, dedicated temporary profile, --mute-audio).
const { connect, sleep } = require('../live-stream/cdp.js');
const base = process.env.APP_URL || 'http://localhost:8081';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9231);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0; const check = (name, v, detail) => { console.log((v ? 'PASS ' : 'FAIL ') + name + (v || detail === undefined ? '' : '\n     ' + detail)); if (!v) { failed++; process.exitCode = 1; } };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(250); } return false; };
  const size = async width => {
    await p.send('Emulation.setDeviceMetricsOverride', { width, height: width < 800 ? 844 : 900, deviceScaleFactor: 2, mobile: width < 800 });
    await p.send('Emulation.setTouchEmulationEnabled', width < 800 ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  };
  const startPlaying = async () => {
    await p.send('Page.navigate', { url: base + '/' });
    await until(`return document.readyState === 'complete' && document.querySelectorAll('.ja-play').length > 0;`, 30000);
    await sleep(800);
    await p.click('.ja-play');
    return until(`var t = document.getElementById('playerAlong'); return !!t && !t.hidden;`, 10000);
  };
  // The first match that is actually drawn (a card's overlay and its caption swap by width).
  const clickVisible = async sel => {
    const ok = await p.eval(`document.querySelectorAll('[data-test-target]').forEach(function(e){ e.removeAttribute('data-test-target'); });
      var e = Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find(function(x){ return x.offsetWidth > 0 && x.offsetHeight > 0; });
      if(e) e.setAttribute('data-test-target', ''); return !!e;`);
    if (!ok) throw new Error('nothing visible for ' + sel);
    return p.click('[data-test-target]');
  };
  // Which popups are open, and is the panel the top layer where it is drawn?
  const state = `
    var b = document.body, a = document.getElementById('along');
    var open = [];
    if(document.getElementById('showSheet').classList.contains('show')) open.push('sheet');
    if(document.getElementById('schedModal').classList.contains('show')) open.push('schedule');
    if(document.getElementById('schedGrid').classList.contains('show')) open.push('grid');
    if(b.classList.contains('menu-open')) open.push('menu');
    if(document.getElementById('donateModal').classList.contains('show')) open.push('donate');
    if(document.getElementById('artLightbox').classList.contains('show')) open.push('lightbox');
    if(window.NowPlaying && window.NowPlaying.isOpen()) open.push('now playing');
    var top = 'panel hidden';
    if(a && !a.hidden && b.classList.contains('along-open')){
      var r = a.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(120, r.height / 2));
      top = a.contains(hit) ? 'top' : 'covered by ' + (hit ? (hit.id || String(hit.className).split(' ')[0]) : 'nothing');
    }
    return JSON.stringify({ open: open, panel: top });`;
  const popups = {
    'show sheet': async () => { await clickVisible('#rows .card-wrap .show-open, #rows .card-meta'); return until(`return document.getElementById('showSheet').classList.contains('show');`, 5000); },
    'episode view': async () => {
      await clickVisible('#rows .card-wrap .show-open, #rows .card-meta'); await until(`return document.getElementById('showSheet').classList.contains('show');`, 5000); await sleep(700);
      await clickVisible('#sheetBody .sheet-episode-open'); return until(`return /\\/show\\/[^/]+\\/[^/]+/.test(location.pathname);`, 5000);
    },
    'artwork zoom': async () => {
      await clickVisible('#rows .card-wrap .show-open, #rows .card-meta'); await until(`return document.getElementById('showSheet').classList.contains('show');`, 5000); await sleep(700);
      await p.click('#sheetBody .sheet-art-zoom'); return until(`return document.getElementById('artLightbox').classList.contains('show');`, 5000);
    },
    'now playing': async () => { await p.click('#playerInfoBtn'); return until(`return (window.NowPlaying && window.NowPlaying.isOpen()) || document.getElementById('showSheet').classList.contains('show');`, 5000); },
    'schedule': async () => {
      if (await p.eval(`return document.getElementById('scheduleBtn').offsetWidth > 0;`)) await p.click('#scheduleBtn');
      else { await p.click('#menuBtn'); await sleep(600); await p.click('#menuSchedule'); }
      return until(`return document.getElementById('schedModal').classList.contains('show');`, 5000);
    },
    'show sheet over the schedule': async () => {
      await popups.schedule(); await sleep(900);
      await clickVisible('#schedBody .show-open, #schedBody [data-id]'); return until(`return document.getElementById('showSheet').classList.contains('show') && document.getElementById('schedModal').classList.contains('show');`, 5000);
    },
    'grid': async () => { await popups.schedule(); await sleep(700); await p.click('#schedGridBtn'); return until(`return document.getElementById('schedGrid').classList.contains('show');`, 5000); },
    'menu': async () => { await p.click('#menuBtn'); return until(`return document.body.classList.contains('menu-open');`, 4000); },
    'donate': async () => { await p.click('#donateBtn'); return until(`return document.getElementById('donateModal').classList.contains('show');`, 4000); },
  };
  const plan = { 390: ['show sheet', 'episode view', 'artwork zoom', 'now playing', 'schedule', 'show sheet over the schedule', 'menu', 'donate'],
                 1280: ['show sheet', 'episode view', 'schedule', 'grid', 'menu'] };

  for (const w of [390, 1280]) {
    await size(w);
    for (const name of plan[w]) {
      const label = `${w}px ${name}`;
      if (!(await startPlaying())) { check(`${label}: the player offers Transcript / Songs`, false, 'no #playerAlong'); continue; }
      const opened = await popups[name]();
      await sleep(700);
      check(`${label}: the popup opened (the probe can see it)`, opened && JSON.parse(await p.eval(state)).open.length > 0, await p.eval(state));
      await p.click('#playerAlong');
      await until(`var a = document.getElementById('along'); return !!a && !a.hidden && document.body.classList.contains('along-open');`, 3000);
      await sleep(700);
      const s = JSON.parse(await p.eval(state));
      check(`${label}: the panel is the top layer`, s.panel === 'top', JSON.stringify(s));
      check(`${label}: no popup is left open under it`, s.open.length === 0, JSON.stringify(s));
      await p.send('Runtime.evaluate', { expression: 'history.back()' });
      await sleep(900);
      const back = JSON.parse(await p.eval(state));
      check(`${label}: Back closes the panel and brings no popup back`, back.panel === 'panel hidden' && back.open.length === 0, JSON.stringify(back));
    }
  }
  console.log(failed ? `\n${failed} failure(s)` : '\nOK — the player bar opens Listen along over every popup');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
