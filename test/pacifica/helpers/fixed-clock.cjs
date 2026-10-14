'use strict';
// Preload (node -r) for tests: the process clock starts at FAKE_NOW_MS and runs forward
// normally. Only Date is replaced; timers and Intl formatting of explicit times are untouched.
const FIXED = Number(process.env.FAKE_NOW_MS);
if (!Number.isFinite(FIXED)) throw new Error('fixed-clock: FAKE_NOW_MS is required');
const RealDate = Date, started = RealDate.now();
const now = () => FIXED + (RealDate.now() - started);
class FixedDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(now()); }
  static now() { return now(); }
}
global.Date = FixedDate;
