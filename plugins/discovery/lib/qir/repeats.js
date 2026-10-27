'use strict';
// Re-runs (2026-10-27, Ace's review: "Nader Oct 4 and Sep 27 are the same audio twice").
// A re-run is recorded off the air again, so its mp3 differs byte for byte; its words don't.
// Each archive episode's QIR transcript is read once, in the background, and kept as a small
// fingerprint: the hashes of its 8-word runs, one in 32 kept (by hash value, so two copies of
// the same text keep the same ones). Two episodes of the same show are the same programme when
// most of the shorter one's runs are in the other and their lengths are close.
//
// Measured on 912 same-show pairs of the live archive (12 shows, 147 transcripts): re-runs
// share 73–95% of their runs; different episodes 0–28%, except three Law and Disorder hours at
// ~47% (repeated fund-drive pitches). SAME sits in the gap. The one-in-32 sample was within 0.04
// of the exact figure. Democracy Now's same-day 4 pm repeat is a re-run too (Paul, 2026-10-27).
//
// The host's archive filter (lib/pacifica/service.js) hides every later airing and gives the
// first `alsoAired`. Fingerprints are kept on the data volume (discovery/repeats.json): losing
// them only means reading the transcripts again.
const fs = require('node:fs');
const path = require('node:path');

const RUN = 8, KEEP_ONE_IN = 32, SAME = 0.6, LENGTH_RATIO = 0.8, MIN_WORDS = 300;
const RETRY_MS = 24 * 3600000;   // a transcript QIR refused (not there yet) is asked for again a day later

function fnv(s) {
  let h = 2166136261;
  for (const byte of Buffer.from(s)) h = Math.imul(h ^ byte, 16777619) >>> 0;
  return h;
}
function fingerprint(text) {
  const w = String(text || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  const kept = new Set();
  for (let i = 0; i + RUN <= w.length; i++) { const h = fnv(w.slice(i, i + RUN).join(' ')); if (h % KEEP_ONE_IN === 0) kept.add(h); }
  return { words: w.length, sample: [...kept].sort((a, b) => a - b) };
}
// Share of the shorter sample found in the other.
function overlap(a, b) {
  const [small, big] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  if (!small.length) return 0;
  let n = 0; for (const h of small) if (big.has(h)) n++;
  return n / small.length;
}
function sameProgramme(a, b) {
  if (!a || !b || a.words < MIN_WORDS || b.words < MIN_WORDS) return false;
  if (Math.min(a.words, b.words) / Math.max(a.words, b.words) < LENGTH_RATIO) return false;   // a clipped recording is not a re-run
  return overlap(a.sample, b.sample) >= SAME;
}
// rows: archive rows ({mp3, sho, dt}); prints: Map mp3 → fingerprint.
// Returns Map later mp3 → first airing's mp3, within each show.
function findRepeats(rows, prints) {
  const byShow = new Map();
  for (const r of rows) if (r && r.mp3 && prints.has(r.mp3)) (byShow.get(r.sho) || byShow.set(r.sho, []).get(r.sho)).push(r);
  const out = new Map();
  for (const list of byShow.values()) {
    list.sort((a, b) => a.dt - b.dt || (a.mp3 < b.mp3 ? -1 : 1));
    const first = list.map((_, i) => i);
    const root = i => { while (first[i] !== i) i = first[i] = first[first[i]]; return i; };
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (root(i) === root(j) || !sameProgramme(prints.get(list[i].mp3), prints.get(list[j].mp3))) continue;
      const [a, b] = [root(i), root(j)]; first[Math.max(a, b)] = Math.min(a, b);   // the earlier airing leads
    }
    list.forEach((r, i) => { const f = root(i); if (f !== i) out.set(r.mp3, list[f].mp3); });
  }
  return out;
}

// The background reader and its saved fingerprints. `qir`: the QIR service (catalog,
// transcriptText). `dir`: where repeats.json lives (null = memory only, for tests).
function createRepeats({ qir, dir = null, now = Date.now, log = console }) {
  const file = dir ? path.join(dir, 'repeats.json') : null;
  const prints = new Map(), refused = new Map();
  let version = 0, rows = [], memo = { key: '', value: new Map() };
  if (file && fs.existsSync(file)) {
    // Caught: a damaged or old-format file. Fingerprints are re-derivable; start over and say so.
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [mp3, p] of Object.entries(saved.prints || {})) if (p && Number.isInteger(p.words) && Array.isArray(p.sample)) prints.set(mp3, p);
    } catch (e) { log.warn(`[qir] re-run fingerprints unreadable (${e.message}); reading transcripts again`); }
  }
  function save() {
    if (!file) return;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, prints: Object.fromEntries(prints) }));
    fs.renameSync(tmp, file);
  }
  // Called by the archive filter with the rows it is about to serve (before re-runs are hidden).
  // Cheap on repeat calls: the answer changes only with the rows or a new fingerprint.
  function apply(current, revision) {
    rows = current;
    const key = `${version}:${revision}:${current.length}`;
    if (memo.key !== key) memo = { key, value: findRepeats(current, prints) };
    return memo.value;
  }
  // One transcript read: the newest archive episode QIR has processed and we have not read.
  // Returns true when it did something (the caller paces itself on that).
  async function step() {
    if (!rows.length) return false;
    const live = new Set(rows.map(r => r.mp3));
    let pruned = false;
    for (const mp3 of prints.keys()) if (!live.has(mp3)) { prints.delete(mp3); pruned = true; }   // aged out of the archive
    const catalog = await qir.catalog();
    const processed = new Map();
    for (const e of catalog.episodes) if (e && e.mp3_url && e.public_id && e.updated_at) processed.set(e.mp3_url, e.public_id);
    const next = [...rows].sort((a, b) => b.dt - a.dt)
      .find(r => !prints.has(r.mp3) && processed.has(r.mp3) && !(refused.has(r.mp3) && now() - refused.get(r.mp3) < RETRY_MS));
    if (!next) { if (pruned) { version++; save(); } return false; }
    try {
      prints.set(next.mp3, fingerprint(await qir.transcriptText(processed.get(next.mp3))));
    } catch (e) {
      // Caught: QIR has no transcript for it yet (404), or is unavailable (its own cooldown,
      // already logged by the QIR service). Ask again later; never guess without the words.
      if (e.status !== 404) throw e;
      refused.set(next.mp3, now());
      return true;
    }
    version++; save();
    return true;
  }
  function status() {
    const live = new Set(rows.map(r => r.mp3));
    return { fingerprinted: [...prints.keys()].filter(m => live.has(m)).length, episodes: live.size, repeats: memo.value.size };
  }
  return { apply, step, status };
}

module.exports = { createRepeats, fingerprint, overlap, sameProgramme, findRepeats, SAME, LENGTH_RATIO, MIN_WORDS };
