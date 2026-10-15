'use strict';
// Frosted bars need the -webkit- spelling (site audit, 2026-10-15). Safari before 18 (iOS 17 and
// older) reads only -webkit-backdrop-filter; the header, the player bar and the back-to-top
// button had only the plain property, so on those iPhones they lost their blur and page text
// showed through. Every served stylesheet, every rule: if it blurs the backdrop, it carries both.
// Shown to fail on the stylesheet before the fix (three rules).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : cssFiles(p);
    return d.name.endsWith('.css') ? [p] : [];
  });
}

// Declaration blocks with their selector, comments removed. Nested @media blocks are entered:
// only blocks with no braces inside are declaration blocks.
function blocks(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

test('every rule that blurs the backdrop also has -webkit-backdrop-filter', () => {
  const files = [...cssFiles(path.join(root, 'public')), ...cssFiles(path.join(root, 'admin')), ...cssFiles(path.join(root, 'plugins'))];
  assert.ok(files.length > 0, 'found the stylesheets');
  let blurring = 0;
  const missing = [];
  for (const file of files) {
    for (const { selector, body } of blocks(fs.readFileSync(file, 'utf8'))) {
      const plain = /(^|[;\s])backdrop-filter\s*:/.test(body);
      if (!plain) continue;
      blurring++;
      if (!/-webkit-backdrop-filter\s*:/.test(body)) missing.push(`${path.relative(root, file)}: ${selector.split('\n').pop().trim()}`);
    }
  }
  assert.ok(blurring > 3, `the sweep sees blurred rules (${blurring})`);
  assert.deepEqual(missing, [], 'rules with backdrop-filter but no -webkit- spelling');
});
