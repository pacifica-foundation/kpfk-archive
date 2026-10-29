'use strict';

/**
 * Fund drive, Phase 4a (Paul, 2026-10-27): the donation capsule's figures. Staff set a goal, the
 * amount pledged so far, an optional name and an on/off switch in the studio; the capsule on
 * Listen Live and the /embed/fund-drive page show them. Just the figures for now (no quick pledge
 * buttons), built to grow into Phase 4 (dates, banner, donate page check).
 *
 * On the data volume, under <DATA_DIR>/fund-drive/ (no deploy to change it):
 *   current.json          { schemaVersion, values, updatedAt }
 *   history/<stamp>.json  the values as they were before each change (undo, newest first)
 *
 * Nothing here is about listeners: only the station's own figures.
 */
const fs = require('fs');
const path = require('path');
const { checkLinkShape } = require('./frame-check');

const SCHEMA_VERSION = 1;
const HISTORY_KEEP = 30;
const NAME_MAX = 40;
const AMOUNT_MAX = 100000000;   // $100 million: far past any station drive, small enough to read
const LINK_MAX = 500;
// donateUrl (Paul, 2026-10-28): where the capsule's and banner's Donate go during the drive, such as
// a pledge page; '' = the station's usual donate link (the profile's links.donate).
// style (Paul, 2026-10-29): how the capsule looks on Listen Live and by default in the embed —
// classic (banner-width card), slim (one line, for a site header or footer), ring (a progress ring
// card, for a sidebar). The embed can ask for another with ?style=.
const STYLES = Object.freeze(['classic', 'slim', 'ring']);
const OFF = Object.freeze({ on: false, name: '', goal: 0, pledged: 0, donateUrl: '', style: 'classic' });

/** Check an edit. Returns { ok, values } or { ok:false, errors } — never a half-applied edit. */
function checkValues(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['The figures must be an object.'] };
  const errors = [];
  const amount = (key, label) => {
    const v = input[key];
    if (!Number.isSafeInteger(v) || v < 0) { errors.push(`${label} must be a whole number of dollars, 0 or more.`); return 0; }
    if (v > AMOUNT_MAX) { errors.push(`${label} is larger than $${AMOUNT_MAX.toLocaleString('en-US')}.`); return 0; }
    return v;
  };
  if (typeof input.on !== 'boolean') errors.push('On or off must be chosen.');
  const goal = amount('goal', 'The goal');
  const pledged = amount('pledged', 'The amount pledged');
  let name = input.name === undefined ? '' : input.name;
  if (typeof name !== 'string') { errors.push('The name must be text.'); name = ''; }
  name = name.replace(/\s+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(name)) errors.push('The name has characters it cannot show.');
  if (name.length > NAME_MAX) errors.push(`The name is longer than ${NAME_MAX} characters.`);
  if (input.on === true && goal === 0) errors.push('Set a goal before switching the fund drive on.');
  let donateUrl = input.donateUrl === undefined ? '' : input.donateUrl;
  if (typeof donateUrl !== 'string') { errors.push('The donate link must be text.'); donateUrl = ''; }
  donateUrl = donateUrl.trim();
  if (donateUrl) {
    const shape = checkLinkShape(donateUrl);
    if (donateUrl.length > LINK_MAX) errors.push(`The donate link is longer than ${LINK_MAX} characters.`);
    else if (!shape.ok) errors.push(`Donate link: ${shape.error}`);
    else donateUrl = shape.url.href;
  }
  const style = input.style === undefined ? 'classic' : input.style;
  if (!STYLES.includes(style)) errors.push(`The style must be one of: ${STYLES.join(', ')}.`);
  const unknown = Object.keys(input).filter((k) => !['on', 'name', 'goal', 'pledged', 'donateUrl', 'style'].includes(k));
  if (unknown.length) errors.push(`Unknown field: ${unknown.join(', ')}.`);
  return errors.length ? { ok: false, errors } : { ok: true, values: { on: input.on, name, goal, pledged, donateUrl, style } };
}

function createFundDrive({ dataDir, writeJsonAtomic, now = () => Date.now() }) {
  const dir = path.join(dataDir, 'fund-drive');
  const file = path.join(dir, 'current.json');
  const historyDir = path.join(dir, 'history');
  const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } };

  // A saved file that no longer passes the checks is reported and treated as off, never rewritten.
  let current = read(file, { schemaVersion: SCHEMA_VERSION, values: { ...OFF }, updatedAt: null });
  let bootError = null;
  const saved = checkValues(current.values);
  // A valid file is read through checkValues too, so one saved before a field existed gets its default.
  current = { ...current, values: saved.ok ? saved.values : { ...OFF } };
  if (!saved.ok) bootError = saved.errors.join(' ');

  function history() {
    let names = [];
    try { names = fs.readdirSync(historyDir).filter((n) => n.endsWith('.json')).sort().reverse(); } catch (e) { /* none yet */ }
    return names;
  }
  function write(values) {
    current = { schemaVersion: SCHEMA_VERSION, values, updatedAt: new Date(now()).toISOString() };
    writeJsonAtomic(file, current);
    bootError = null;
  }
  return {
    /** What listeners and the embed get: the figures and when they last changed. */
    public: () => ({ ...current.values, updatedAt: current.updatedAt }),
    bootError: () => bootError,
    history: () => history().map((n) => { const h = read(path.join(historyDir, n), {}); return { at: h.replacedAt || null, values: h.values || null }; }),
    apply(input) {
      const c = checkValues(input);
      if (!c.ok) return c;
      const at = new Date(now()).toISOString();
      // The same figures again (a double click, a retry) change nothing and add no history.
      if (JSON.stringify(c.values) === JSON.stringify(current.values)) return { ok: true, unchanged: true };
      const stamp = at.replace(/[:.]/g, '-');
      writeJsonAtomic(path.join(historyDir, `${stamp}.json`), { ...current, replacedAt: at });
      write(c.values);
      for (const old of history().slice(HISTORY_KEEP)) fs.rmSync(path.join(historyDir, old), { force: true });
      return { ok: true };
    },
    /** Put back the figures as they were before the last change. */
    undo() {
      const [last] = history();
      if (!last) return { ok: false, errors: ['There is no change to undo.'] };
      const prev = read(path.join(historyDir, last), null);
      const c = checkValues(prev && prev.values);
      write(c.ok ? c.values : { ...OFF });
      fs.rmSync(path.join(historyDir, last), { force: true });
      return { ok: true };
    },
  };
}

module.exports = { createFundDrive, checkValues, NAME_MAX, AMOUNT_MAX, STYLES };
