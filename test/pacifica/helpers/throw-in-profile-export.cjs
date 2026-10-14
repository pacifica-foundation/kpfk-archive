'use strict';
// Preload (node -r) for tests: the studio's station-profile export throws, standing in for any
// bug in a route. The module object is the one server.js gets from require(), so the server
// calls this replacement.
const profile = require('../../../lib/export/profile');
profile.exportFilename = () => { throw new Error('planted failure in a studio route'); };
