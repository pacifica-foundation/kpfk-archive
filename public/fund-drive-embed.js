/* /embed/fund-drive (Phase 4a): the capsule alone, for the station's own sites to frame.
 * ?theme=light|dark pins the colours to the host page; without it the visitor's system decides. */
(function () {
  'use strict';
  var theme = (/[?&]theme=(light|dark)\b/.exec(location.search) || [])[1];
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  // /station.js sets window.StationConfig (the app's own code calls it STATION). A station with no
  // donate link gets a capsule without the button; missing settings are a bug, so say so.
  var cfg = window.StationConfig;
  if (!cfg) console.warn('[fund drive embed] /station.js did not load: no donate link');
  var donate = (cfg && cfg.links && cfg.links.donate) || '';
  window.FundDrive.mount(document.getElementById('capsule'), { donateHref: donate, newTab: true });
})();
