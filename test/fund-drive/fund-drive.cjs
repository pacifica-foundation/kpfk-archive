// Fund drive, Phase 4a (Paul, 2026-10-27), real taps in Chrome on a scratch server (run.sh):
//  1. The studio's Fund drive card: switch on, type the goal and the amount pledged; the preview is
//     the real capsule and follows the typing; Publish; listeners' figures change at once.
//  2. Listen Live shows the capsule under the player (amount, goal, percent, name); its Donate opens
//     the donate window OVER the page (stays on /live).
//  3. The embed page shows the same capsule; its Donate opens the donate page in a new tab.
//  4. Off in the studio: the capsule is gone from Listen Live and the embed.
//  5. Phone width, light and dark: no sideways scroll, nothing cut off, Donate full width.
const { connect, sleep } = require('../live-stream/cdp.js');
const base = (process.env.APP || 'http://127.0.0.1:8093/').replace(/\/$/, '');
const password = process.env.STUDIO_PW || 'pw';
(async () => {
  const p = await connect(Number(process.env.CDP_PORT) || 9234);
  await p.send('Page.enable'); await p.send('Runtime.enable');
  let failed = 0;
  const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '\n     ' + detail)); if (!ok) failed++; };
  const until = async (js, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await p.eval(js)) return true; } catch { /* navigating */ } await sleep(200); } return false; };
  const ev = js => p.eval(js).catch(e => 'ERR ' + e.message);
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
  const publicFigures = () => ev(`return fetch('/api/fund-drive', {cache: 'no-store'}).then(r => r.json()).then(j => JSON.stringify(j));`).then(JSON.parse);

  await size(1280, false);
  // ---- 1: the studio card
  await go('/studio');
  await p.eval(`return fetch('/api/studio/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(password)} }) }).then(r => r.status);`);
  await go('/studio');
  await until(`return !!document.getElementById('tabDiscovery') && !document.getElementById('tabDiscovery').hidden;`, 15000);
  await p.click('#tabDiscovery');
  check('the studio has a Fund drive card', await until(`var s = document.getElementById('fundSection'); return !!s && !s.hidden && s.offsetHeight > 100;`, 10000));
  check('… never set up: off, Publish disabled', (await ev(`return document.getElementById('fdOn').getAttribute('aria-checked');`)) === 'false'
    && await ev(`return document.getElementById('fdPublish').disabled;`));
  await p.click('#fdOn');
  await type('#fdName', 'Fall Fund Drive');
  await type('#fdGoal', '75000');
  await type('#fdPledged', '42350');
  check('… the figures are shown as dollars', (await ev(`return document.getElementById('fdGoal').value + ' / ' + document.getElementById('fdPledged').value;`)) === '75,000 / 42,350',
    await ev(`return document.getElementById('fdGoal').value + ' / ' + document.getElementById('fdPledged').value;`));
  check('… the preview is the capsule, following the typing', await until(`var c = document.getElementById('fdPreview'); return !c.hidden && /\\$42,350/.test(c.textContent) && /\\$75,000/.test(c.textContent) && /56%/.test(c.textContent) && /Fall Fund Drive/i.test(c.textContent);`, 4000),
    await capText('#fdPreview'));
  check('… not live until Publish', (await publicFigures()).on === false && !(await ev(`return document.getElementById('fdPublish').disabled;`)));
  await p.click('#fdPublish');
  check('Publish: listeners\' figures change at once', await until(`return /Published/.test(document.getElementById('fdStatus').textContent);`, 6000)
    && JSON.stringify((({ on, name, goal, pledged }) => ({ on, name, goal, pledged }))(await publicFigures())) === JSON.stringify({ on: true, name: 'Fall Fund Drive', goal: 75000, pledged: 42350 }),
    JSON.stringify(await publicFigures()) + ' ' + await ev(`return document.getElementById('fdStatus').textContent;`));
  check('… the embed snippet is ready to copy', /<iframe src="[^"]*\/embed\/fund-drive\?theme=light"/.test(await ev(`return document.getElementById('fdSnippet').textContent;`)));

  // ---- 2: Listen Live
  await go('/live');
  check('Listen Live shows the capsule under the player', await until(`var c = document.getElementById('lvFund'); return !c.hidden && /\\$42,350/.test(c.textContent) && /56%/.test(c.textContent);`, 12000), await capText('#lvFund'));
  check('… with the goal and the name', /\$75,000 goal/.test(await capText('#lvFund')) && /Fall Fund Drive/i.test(await capText('#lvFund')), await capText('#lvFund'));
  check('… right under the player', await ev(`var pl = document.querySelector('.lv-player').getBoundingClientRect(), c = document.getElementById('lvFund').getBoundingClientRect(); return c.top >= pl.bottom && c.top - pl.bottom < 40;`));
  await p.click('#lvFund .fd-btn');
  check('… its Donate opens the donate window over the page (still /live)', await until(`return document.getElementById('donateModal').classList.contains('show');`, 4000)
    && (await ev(`return location.pathname;`)) === '/live' && await ev(`return !document.getElementById('livePage').hidden;`));
  await p.click('#donateClose');

  // ---- 3: the embed
  await go('/embed/fund-drive?theme=light');
  check('the embed shows the same capsule', await until(`var c = document.getElementById('capsule'); return !!c && !c.hidden && /\\$42,350/.test(c.textContent);`, 8000), await capText('#capsule'));
  check('… light as asked (?theme=light)', (await ev(`return document.documentElement.getAttribute('data-theme');`)) === 'light');
  check('… its Donate opens the donate page in a new tab', await ev(`var a = document.querySelector('#capsule .fd-btn'); return a.target === '_blank' && /^https:\\/\\//.test(a.href) && !a.hidden;`),
    await ev(`var a = document.querySelector('#capsule .fd-btn'); return a.target + ' ' + a.href;`));
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
  await p.click('#fdPublish');
  await until(`return /Published/.test(document.getElementById('fdStatus').textContent);`, 6000);
  check('off in the studio: listeners\' figures say off', (await publicFigures()).on === false);
  await go('/live');
  await until(`return !!document.getElementById('lvTitle') && document.getElementById('lvTitle').textContent.trim().length > 1;`, 15000);
  await sleep(1500);
  check('… Listen Live shows no capsule', await ev(`var c = document.getElementById('lvFund'); return c.hidden && c.offsetHeight === 0;`));
  await go('/embed/fund-drive');
  await sleep(1500);
  check('… nor does the embed', await ev(`var c = document.getElementById('capsule'); return c.hidden && c.offsetHeight === 0;`));

  check('no uncaught errors anywhere in the run', !errors.length, errors.slice(0, 3).join('\n     '));
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
