'use strict';
// The Docker image copies named folders only (Dockerfile COPY lines). A folder server.js reads at
// run time that is not copied works on a laptop and fails only on the live server — the class of
// slip a new folder (embed/, 2026-10-27) invites. This reads both files and checks every one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

// Folders the server reads beside itself: path.join(__dirname, 'x') and require('./x/...').
// data/ is the volume and seed/ is optional (an env-configured warm-start file); neither ships.
const NOT_SHIPPED = new Set(['data', 'seed']);
function foldersRead(src) {
  const out = new Set();
  for (const m of src.matchAll(/path\.join\(__dirname,\s*'([^'/]+)'/g)) out.add(m[1]);
  for (const m of src.matchAll(/require\('\.\/([^'/]+)\//g)) out.add(m[1]);
  return [...out].filter(d => !NOT_SHIPPED.has(d) && !d.includes('.'));
}
function foldersCopied(dockerfile) {
  return new Set([...dockerfile.matchAll(/^COPY\s+(\S+)\s+\.\/\S*$/gm)].map(m => m[1].replace(/\/$/, '')));
}
function missing(src, dockerfile) { const copied = foldersCopied(dockerfile); return foldersRead(src).filter(d => !copied.has(d)); }

test('every folder server.js reads is copied into the image', () => {
  const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  // Positive control: the probe finds the folders we know the server reads.
  for (const d of ['public', 'admin', 'lib', 'embed']) assert.ok(foldersRead(src).includes(d), `probe should see ${d}/`);
  assert.deepEqual(missing(src, dockerfile), []);
  // And it can still see the slip: the same Dockerfile without the embed line reports it.
  assert.deepEqual(missing(src, dockerfile.replace(/^COPY embed \.\/embed$/m, '')), ['embed']);
});
