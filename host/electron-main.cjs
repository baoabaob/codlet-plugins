'use strict';
const { installElectronTraffic: installSessions } = require('./electron-traffic.cjs');
const { installBackendSpawn } = require('./backend-spawn.cjs');
function installElectronTraffic(electron, configuration) {
  const backend = installBackendSpawn(configuration);
  let sessions;
  try { sessions = installSessions(electron, configuration); }
  catch (error) { backend.close(); throw error; }
  return Object.freeze({ async ready() { const state = await sessions.ready(); return { ...state, backend: backend.inspect() }; },
    inspect: () => ({ ...sessions.inspect(), backend: backend.inspect() }),
    async close() { backend.close(); await sessions.close(); } });
}
module.exports = { installElectronTraffic };
