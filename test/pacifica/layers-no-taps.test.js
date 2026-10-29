'use strict';
// A layer that fades out must take no taps while hidden or fading (2026-10-29). The show popup
// (.sheet) had visibility:hidden but no pointer-events:none, so for the length of its fade-out
// the invisible popup caught taps meant for the page under it: test/listen-live hit it tapping
// Full schedule right after closing a show. visibility:hidden only takes effect when the fade
// ends, so the hidden state itself has to say pointer-events:none.
// This checks every such rule in styles.css, so a new layer can't bring the bug back; the
// browser suite (test/listen-live) checks the effect.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const STYLES = process.env.STYLES || path.resolve(__dirname, '../../public/styles.css');

function fadingHiddenRules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim().split('\n').pop().trim(), body = m[2];
    // Hidden by visibility and animated away (opacity or a move): the fade-out window exists.
    if (/visibility:\s*hidden/.test(body) && /(opacity:\s*0|transform:)/.test(body)) {
      out.push({ sel, body, line: css.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

test('every layer that fades out takes no taps while hidden or fading', () => {
  const css = fs.readFileSync(STYLES, 'utf8');
  const rules = fadingHiddenRules(css);
  const names = rules.map(r => r.sel).join(' | ');
  for (const layer of ['.sheet', '.live-player', '.menu-panel', '.live-choice']) {
    assert.ok(rules.some(r => r.sel.split(',').map(x => x.trim()).includes(layer)), `the probe sees ${layer} (${names})`);
  }
  const leaky = rules.filter(r => !/pointer-events:\s*none/.test(r.body)).map(r => `${r.sel} (line ${r.line})`);
  assert.deepEqual(leaky, [], 'hidden layers without pointer-events:none catch taps while they fade');
});

test('each of those layers takes taps again once shown', () => {
  const css = fs.readFileSync(STYLES, 'utf8');
  for (const layer of ['.sheet', '.live-player', '.menu-panel', '.live-choice']) {
    const shown = new RegExp('^\\s*\\' + layer + '\\.show\\{([^}]*)\\}', 'm').exec(css);
    assert.ok(shown, `${layer}.show rule exists`);
    assert.match(shown[1], /pointer-events:\s*auto/, `${layer}.show sets pointer-events:auto`);
  }
});
