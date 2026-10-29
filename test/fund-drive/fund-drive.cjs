// Fund drive, Phase 4a (Paul, 2026-10-27), real taps in Chrome on a scratch server (run.sh):
//  1. The studio's Fund drive card: type the goal and the amount pledged; the preview is the real
//     capsule and follows the typing, at Phone or Wide width; Update figures saves them while the
//     drive is off; the switch asks first (Cancel changes nothing), then shows it at once
//     (Paul, 2026-10-28: Publish beside a switch was confusing).
//  2. Listen Live shows the capsule under the player (amount, goal, percent, name); its Donate opens
//     the donate window OVER the page (stays on /live).
//  3. The embed page shows the same capsule; its Donate opens the donate page in a new tab.
//  4. Off in the studio (the switch, confirmed): the capsule is gone from Listen Live and the embed.
//  5. Phone width, light and dark: no sideways scroll, nothing cut off, Donate full width.
const { connect, sleep } = require('../live-stream/cdp.js');
const base = (process.env.APP || 'http://127.0.0.1:8093/').replace(/\/$/, '');
const password = process.env.STUDIO_PW || 'pw';
// A fund-drive page on the station's donate site (allowed in the Donate window either way).
const DRIVE_LINK = 'https://docs.pacifica.org/kpfk/donate/?drive=fall';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9234);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0;
  const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '\n     ' + detail)); if (!ok) failed++; };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(200); } return false; };
  // A failed page eval is FALSE (and printed), never a truthy error string: an error text used to
  // pass a check that crashed (2026-10-27, the studio banner check passed on code with no banner).
  const ev = js => p.eval(js).catch(e => { console.log('     (page eval failed: ' + String(e.message).slice(0, 160) + ')'); return false; });
  const errors = [];
  p.on(m => {
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(((d.exception && d.exception.description) || d.text).split('\n')[0]); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const text = m.params.args.map(a => a.value || a.description).join(' ');
      // The local QIR catalog has no key on a laptop (503); the listener page says so itself.
      if (!/QIR catalog unavailable/.test(text)) errors.push('console.error: ' + text);
    }
  });
  const size = async (width, mobile) => {
    await p.send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 900, deviceScaleFactor: 2, mobile: !!mobile });
    await p.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  };
  const go = async (path) => { await p.send('Page.navigate', { url: base + path }); await sleep(300); await until(`return document.readyState === 'complete';`, 20000); };
  const type = async (sel, text) => {
    await p.eval(`var i = document.querySelector(${JSON.stringify(sel)}); i.focus(); i.select(); return 1;`);
    await p.send('Input.insertText', { text });
    await p.eval(`document.querySelector(${JSON.stringify(sel)}).blur(); return 1;`);
  };
  const capText = sel => ev(`var c = document.querySelector(${JSON.stringify(sel)}); return c && !c.hidden && c.offsetHeight > 0 ? c.textContent.replace(/\\s+/g, ' ').trim() : '';`);
  const dialogOpen = () => ev(`var d = document.querySelector('dialog.studio-dialog'); return !!d && d.open;`);
  const answer = async yes => { await p.click(`dialog.studio-dialog [data-answer="${yes ? 'yes' : 'no'}"]`); await until(`var d = document.querySelector('dialog.studio-dialog'); return !d.open;`, 3000); };
  const publicFigures = () => ev(`return fetch('/api/fund-drive', {cache: 'no-store'}).then(r => r.json()).then(j => JSON.stringify(j));`).then(JSON.parse);

  await size(1280, false);
  // ---- 1: the studio card
  await go('/studio');
  await p.eval(`return fetch('/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(password)} }) }).then(r => r.status);`);
  await go('/studio');
  await until(`return !!document.getElementById('tabDiscovery') && !document.getElementById('tabDiscovery').hidden;`, 15000);
  await p.click('#tabDiscovery');
  check('the studio has a Fund drive card', await until(`var s = document.getElementById('fundSection'); return !!s && !s.hidden && s.offsetHeight > 100;`, 10000));
  check('… never set up: off, Update figures disabled', (await ev(`return document.getElementById('fdOn').getAttribute('aria-checked');`)) === 'false'
    && await ev(`return document.getElementById('fdPublish').disabled;`));
  // Paul, 2026-10-27: the preview must show something before anything is typed.
  check('… the preview already shows a capsule, marked Example', await until(`var c = document.getElementById('fdPreview'); return !c.hidden && c.offsetHeight > 40 && /\\$/.test(c.textContent) && document.getElementById('fdPreviewTag').textContent === 'Example';`, 4000),
    await ev(`return document.getElementById('fdPreviewTag').textContent + ' | ' + document.getElementById('fdPreview').textContent.slice(0, 80);`));
  check('… the embed snippet is shown, not folded away', await ev(`var e = document.getElementById('fdSnippet'); return e.offsetHeight > 20 && !e.closest('details');`));
  const lay = JSON.parse(await p.eval(`var f = document.querySelector('.fd-form').getBoundingClientRect(), v = document.querySelector('.fd-side').getBoundingClientRect();
    return JSON.stringify({ formW: Math.round(f.width), sideBySide: f.right <= v.left + 1 && Math.abs(f.top - v.top) < 60 });`));
  check('… desktop: a compact form beside the preview', lay.sideBySide && lay.formW <= 420, JSON.stringify(lay));
  // The switch with no goal: nothing opens, nothing goes live, and it says why.
  await p.click('#fdOn');
  await sleep(400);
  check('… the switch with no goal: no confirm box, still off, asks for a goal', !(await dialogOpen())
    && (await ev(`return document.getElementById('fdOn').getAttribute('aria-checked');`)) === 'false'
    && /goal first/.test(await ev(`return document.getElementById('fdStatus').textContent;`)) && (await publicFigures()).on === false,
    await ev(`return document.getElementById('fdStatus').textContent;`));
  await type('#fdName', 'Fall Fund Drive');
  await type('#fdGoal', '75000');
  await type('#fdPledged', '40000');
  // The donate link (2026-10-28): checked on leaving the box. An inside address is refused by the
  // check without any network, so the warning is proven to show.
  await type('#fdLink', 'https://127.0.0.1/give');
  check('donate link: the studio warns when it cannot check the page', await until(`return /is-bad/.test(document.getElementById('fdLinkCheck').className) && /public internet/.test(document.getElementById('fdLinkCheck').textContent);`, 6000),
    await ev(`return document.getElementById('fdLinkCheck').className + ' | ' + document.getElementById('fdLinkCheck').textContent;`));
  await sleep(1100);   // the check takes one a second
  await type('#fdLink', DRIVE_LINK);
  check('… the figures are shown as dollars', (await ev(`return document.getElementById('fdGoal').value + ' / ' + document.getElementById('fdPledged').value;`)) === '75,000 / 40,000',
    await ev(`return document.getElementById('fdGoal').value + ' / ' + document.getElementById('fdPledged').value;`));
  check('… typing is a draft: Update figures lights up, the switch stays off', (await ev(`return document.getElementById('fdPreviewTag').textContent;`)) === 'Draft'
    && !(await ev(`return document.getElementById('fdPublish').disabled;`)) && (await ev(`return document.getElementById('fdOn').getAttribute('aria-checked');`)) === 'false');
  await p.click('#fdPublish');
  check('Update figures while off: saved, not shown', await until(`return /Saved\. Not shown/.test(document.getElementById('fdStatus').textContent);`, 6000)
    && JSON.stringify((({ on, goal, pledged, donateUrl }) => ({ on, goal, pledged, donateUrl }))(await publicFigures())) === JSON.stringify({ on: false, goal: 75000, pledged: 40000, donateUrl: DRIVE_LINK }),
    JSON.stringify(await publicFigures()) + ' ' + await ev(`return document.getElementById('fdStatus').textContent;`));
  check('… the preview is marked Off', (await ev(`return document.getElementById('fdPreviewTag').textContent;`)) === 'Off');
  await type('#fdPledged', '42350');
  check('… the preview is the capsule, following the typing', await until(`var c = document.getElementById('fdPreview'); return !c.hidden && /\\$42,350/.test(c.textContent) && /\\$75,000/.test(c.textContent) && /56%/.test(c.textContent) && /Fall Fund Drive/i.test(c.textContent);`, 4000),
    await capText('#fdPreview'));
  check('… the preview shows the banner above the capsule, with the name', await ev(`var b = document.getElementById('fdPreviewBanner'), c = document.getElementById('fdPreview');
    return !b.hidden && b.offsetHeight > 0 && /Fall Fund Drive · Donate now/.test(b.textContent) && b.getBoundingClientRect().bottom <= c.getBoundingClientRect().top + 1;`),
    await ev(`return document.getElementById('fdPreviewBanner').textContent;`));
  // Phone or Wide (Paul, 2026-10-28): the capsule follows its own width, so the Phone box shows
  // the real phone layout (stacked, Donate full width) on a desktop screen.
  const shape = async () => JSON.parse(await p.eval(`var c = document.getElementById('fdPreview'), r = c.getBoundingClientRect(),
    b = c.querySelector('.fd-btn').getBoundingClientRect(), f = c.querySelector('.fd-foot').getBoundingClientRect();
    return JSON.stringify({ w: Math.round(r.width), stacked: b.top >= f.bottom - 1, btnW: Math.round(b.width) });`));
  await p.click('button[data-fd-size="phone"]');
  await sleep(500);
  const phone = await shape();
  check('preview Phone: phone width, stacked, Donate full width', phone.w <= 360 && phone.stacked && phone.btnW >= phone.w - 40, JSON.stringify(phone));
  await p.click('button[data-fd-size="wide"]');
  await sleep(500);
  const wide = await shape();
  check('preview Wide: the whole column, Donate beside the figures', wide.w >= 500 && !wide.stacked, JSON.stringify(wide));
  // The switch asks first; Cancel changes nothing.
  await sleep(1100);   // the server takes one change a second
  await p.click('#fdOn');
  check('the switch on: a confirm box with the figures', await until(`var d = document.querySelector('dialog.studio-dialog'); return !!d && d.open && /Start the fund drive/.test(d.textContent) && /\\$42,350 of a \\$75,000 goal/.test(d.textContent);`, 3000),
    await ev(`var d = document.querySelector('dialog.studio-dialog'); return d ? d.open + ' ' + d.textContent : 'no dialog';`));
  await answer(false);
  check('… Cancel: still off for listeners, the switch still off', (await publicFigures()).on === false
    && (await ev(`return document.getElementById('fdOn').getAttribute('aria-checked');`)) === 'false');
  await p.click('#fdOn');
  await until(`var d = document.querySelector('dialog.studio-dialog'); return !!d && d.open;`, 3000);
  await answer(true);
  check('… Show it now: listeners\' figures change at once', await until(`return /^On\./.test(document.getElementById('fdStatus').textContent);`, 6000)
    && JSON.stringify((({ on, name, goal, pledged }) => ({ on, name, goal, pledged }))(await publicFigures())) === JSON.stringify({ on: true, name: 'Fall Fund Drive', goal: 75000, pledged: 42350 }),
    JSON.stringify(await publicFigures()) + ' ' + await ev(`return document.getElementById('fdStatus').textContent;`));
  check('… the embed snippet is ready to copy', /<iframe src="[^"]*\/embed\/fund-drive\?theme=light&style=classic"/.test(await ev(`return document.getElementById('fdSnippet').textContent;`)));
  check('… the preview is marked Live', (await ev(`return document.getElementById('fdPreviewTag').textContent;`)) === 'Live');
  // Paul, 2026-10-27: the snippet said theme=light but the embed opened dark. One choice now sets
  // the preview's colours, the snippet's ?theme= and Open the embed's address.
  const capBg = `return getComputedStyle(document.querySelector('#fdPreview')).backgroundColor;`;
  const th = async () => JSON.parse(await p.eval(`return JSON.stringify({ bg: getComputedStyle(document.getElementById('fdPreview')).backgroundColor,
    snippet: /theme=(\\w+)/.exec(document.getElementById('fdSnippet').textContent)[1], open: document.getElementById('fdOpenEmbed').getAttribute('href') });`));
  const light = await th();
  check('… light by default: a white capsule, snippet and Open both theme=light', light.bg === 'rgb(255, 255, 255)' && light.snippet === 'light' && light.open === '/embed/fund-drive?theme=light&style=classic', JSON.stringify(light));
  await p.click('[data-fd-theme="dark"]');
  const dark = await th();
  check('… Dark: a dark capsule, snippet and Open both theme=dark', dark.bg === 'rgb(28, 22, 21)' && dark.snippet === 'dark' && dark.open === '/embed/fund-drive?theme=dark&style=classic', JSON.stringify(dark));
  // Style (2026-10-29): the picker redraws the preview and pins the snippet's style and height; it is a
  // draft until Update figures, so picking Classic again leaves nothing to save.
  await p.click('[data-fd-style="ring"]');
  const ring = JSON.parse(await ev(`return JSON.stringify({ style: document.getElementById('fdPreview').getAttribute('data-style'), ringShown: getComputedStyle(document.querySelector('#fdPreview .fd-ring')).display !== 'none',
    barShown: getComputedStyle(document.querySelector('#fdPreview .fd-bar')).display !== 'none', snippet: document.getElementById('fdSnippet').textContent, save: !document.getElementById('fdPublish').disabled,
    card: document.querySelector('.fd-style-card[data-fd-style="ring"]').getAttribute('aria-pressed'), badge: getComputedStyle(document.querySelector('.fd-style-card[data-fd-style="ring"] .fd-style-tick')).display, note: document.getElementById('fdStyleNote').textContent });`));
  check('… Style Ring: the preview draws the ring (no bar), the snippet pins style=ring at 340px, Update figures is offered',
    ring.card === 'true' && ring.badge !== 'none' && /not saved yet/.test(ring.note) && ring.style === 'ring' && ring.ringShown && !ring.barShown && /style=ring"/.test(ring.snippet) && /height:340px/.test(ring.snippet) && ring.save, JSON.stringify(ring));
  await p.click('[data-fd-style="classic"]');
  check('… back to Classic: nothing to save', await ev(`return document.getElementById('fdPublish').disabled && document.getElementById('fdPreview').getAttribute('data-style') === 'classic';`));
  await p.click('[data-fd-theme="light"]');
  check('… Copy and Open are buttons, their labels centred', await ev(`return ['fdCopy', 'fdOpenEmbed'].every(function(id){ var b = document.getElementById(id), r = b.getBoundingClientRect(), t = b.querySelector('span').getBoundingClientRect();
    return /flex/.test(getComputedStyle(b).display) && Math.abs((t.top + t.height / 2) - (r.top + r.height / 2)) <= 2 && !!b.querySelector('svg'); });`));
  // Phone width: stacked, preview first, nothing sideways.
  await size(390, true);
  await sleep(500);
  const ph = JSON.parse(await p.eval(`var f = document.querySelector('.fd-form').getBoundingClientRect(), v = document.querySelector('.fd-side').getBoundingClientRect();
    return JSON.stringify({ previewFirst: v.bottom <= f.top + 1, sideways: document.documentElement.scrollWidth - innerWidth });`));
  check('studio on a phone: preview above the form, no sideways scroll', ph.previewFirst && ph.sideways <= 0, JSON.stringify(ph));
  await size(1280, false);

  // ---- 2: Listen Live
  await go('/live');
  check('Listen Live shows the capsule under the player', await until(`var c = document.getElementById('lvFund'); return !c.hidden && /\\$42,350/.test(c.textContent) && /56%/.test(c.textContent);`, 12000), await capText('#lvFund'));
  check('… with the goal and the name', /\$75,000 goal/.test(await capText('#lvFund')) && /Fall Fund Drive/i.test(await capText('#lvFund')), await capText('#lvFund'));
  check('… right under the player', await ev(`var pl = document.querySelector('.lv-player').getBoundingClientRect(), c = document.getElementById('lvFund').getBoundingClientRect(); return c.top >= pl.bottom && c.top - pl.bottom < 40;`));
  // The approved design's banner (Paul, 2026-10-27): top of the page, same switch, opens Donate over it.
  check('… the fund drive banner is at the top of the page, with the name', await until(`var b = document.getElementById('lvBanner'); return !b.hidden && b.offsetHeight > 0 && /Fall Fund Drive · Donate now/.test(b.textContent)
    && b.getBoundingClientRect().top <= document.querySelector('.lv-grid').getBoundingClientRect().top;`, 6000), await ev(`var b = document.getElementById('lvBanner'); return b.hidden + ' ' + b.textContent;`));
  await p.click('#lvBanner');
  check('… tapping the banner opens Donate over the page (still /live), on the drive\'s link', await until(`return document.getElementById('donateModal').classList.contains('show');`, 4000)
    && (await ev(`return location.pathname;`)) === '/live' && (await ev(`return document.getElementById('donateFrame').src;`)) === DRIVE_LINK,
    await ev(`return document.getElementById('donateFrame').src;`));
  await p.click('#donateClose');
  await until(`return !document.getElementById('donateModal').classList.contains('show');`, 4000);
  await until(`var d = document.querySelector('#lvFund .fd-btn'); d.scrollIntoView({block: 'center'}); var b = d.getBoundingClientRect(); var e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && d.contains(e);`, 4000);
  await p.click('#lvFund .fd-btn');
  check('… its Donate opens the donate window over the page (still /live)', await until(`return document.getElementById('donateModal').classList.contains('show');`, 4000)
    && (await ev(`return location.pathname;`)) === '/live' && await ev(`return !document.getElementById('livePage').hidden;`));
  check('… on the fund drive\'s own donate link', (await ev(`return document.getElementById('donateFrame').src;`)) === DRIVE_LINK,
    await ev(`return document.getElementById('donateFrame').src;`));
  await p.click('#donateClose');

  // ---- 3: the embed
  await go('/embed/fund-drive?theme=light');
  check('the embed shows the same capsule', await until(`var c = document.getElementById('capsule'); return !!c && !c.hidden && /\\$42,350/.test(c.textContent);`, 8000), await capText('#capsule'));
  check('… light as asked (?theme=light)', (await ev(`return document.documentElement.getAttribute('data-theme');`)) === 'light');
  check('… its Donate opens the drive\'s donate link in a new tab', await ev(`var a = document.querySelector('#capsule .fd-btn'); return a.target === '_blank' && a.href === ${JSON.stringify(DRIVE_LINK)} && !a.hidden;`),
    await ev(`var a = document.querySelector('#capsule .fd-btn'); return a.target + ' ' + a.href;`));
  await go('/embed/fund-drive?theme=light&style=slim');
  check('… ?style=slim: the same capsule as one line', await until(`var c = document.getElementById('capsule'); return !!c && !c.hidden && c.getAttribute('data-style') === 'slim' && c.getBoundingClientRect().height < 90;`, 8000),
    await ev(`var c = document.getElementById('capsule'); return c.getAttribute('data-style') + ' h=' + Math.round(c.getBoundingClientRect().height) + ' w=' + innerWidth;`));
  await go('/embed/fund-drive?theme=light');
  await until(`var c = document.getElementById('capsule'); return !!c && !c.hidden;`, 8000);
  check('… nothing but the capsule, on a see-through page', await ev(`return getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)' && document.body.children.length <= 2;`),
    await ev(`return getComputedStyle(document.body).backgroundColor;`));

  // ---- 5: phone width, light and dark
  for (const theme of ['light', 'dark']) {
    await size(390, true);
    await go('/live');
    await p.eval(`document.documentElement.dataset.theme = '${theme}'; return 1;`);
    await until(`var c = document.getElementById('lvFund'); return !c.hidden && c.offsetHeight > 0;`, 12000);
    await sleep(1200);
    const L = JSON.parse(await p.eval(`
      var c = document.getElementById('lvFund'), b = c.querySelector('.fd-btn').getBoundingClientRect(), r = c.getBoundingClientRect();
      var cut = [...c.querySelectorAll('.fd-eyebrow span, .fd-amt, .fd-of, .fd-btn')].filter(function(e){ return e.scrollWidth > e.clientWidth + 1; }).map(function(e){ return e.textContent.slice(0, 20); });
      return JSON.stringify({ sideways: document.documentElement.scrollWidth - innerWidth, fullBtn: b.width >= r.width - 40, cut: cut });`));
    check(`phone ${theme}: no sideways scroll`, L.sideways <= 0, JSON.stringify(L));
    check(`phone ${theme}: nothing cut off in the capsule`, !L.cut.length, JSON.stringify(L.cut));
    check(`phone ${theme}: Donate is full width`, L.fullBtn, JSON.stringify(L));
  }

  // ---- 4: off
  await size(1280, false);
  await go('/studio');
  await until(`return !!document.getElementById('tabDiscovery') && !document.getElementById('tabDiscovery').hidden;`, 15000);
  await p.click('#tabDiscovery');
  await until(`var s = document.getElementById('fundSection'); return !!s && !s.hidden;`, 10000);
  await sleep(1100);   // the server takes one change a second
  await p.click('#fdOn');
  check('the switch off: a confirm box', await until(`var d = document.querySelector('dialog.studio-dialog'); return !!d && d.open && /Take the fund drive down/.test(d.textContent);`, 3000));
  await answer(true);
  await until(`return /^Off\./.test(document.getElementById('fdStatus').textContent);`, 6000);
  check('off in the studio: listeners\' figures say off', (await publicFigures()).on === false
    && (await ev(`return document.getElementById('fdOn').getAttribute('aria-checked');`)) === 'false');
  await go('/live');
  await until(`return !!document.getElementById('lvTitle') && document.getElementById('lvTitle').textContent.trim().length > 1;`, 15000);
  await sleep(1500);
  check('… Listen Live shows no capsule and no banner', await ev(`var c = document.getElementById('lvFund'), b = document.getElementById('lvBanner'); return c.hidden && c.offsetHeight === 0 && b.hidden && b.offsetHeight === 0;`));
  await go('/embed/fund-drive');
  await sleep(1500);
  check('… nor does the embed', await ev(`var c = document.getElementById('capsule'); return c.hidden && c.offsetHeight === 0;`));

  check('no uncaught errors anywhere in the run', !errors.length, errors.slice(0, 3).join('\n     '));
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
