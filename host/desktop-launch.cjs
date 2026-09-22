'use strict';
const { attachElectronTrafficBeforeEntry } = require('./electron-bootstrap.cjs');
const path = require('node:path');
const fail = code => Object.assign(new Error(code), { code });
function launchProxy(traffic) {
  const proxy = new URL(traffic?.proxyUrl);
  if (proxy.protocol !== 'http:' || proxy.hostname !== '127.0.0.1' || !proxy.port || !proxy.username || !proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash) throw fail('invalid_process_proxy');
  return proxy;
}
async function prepareClientLaunch({ traffic, signal }) {
  if (signal.aborted) throw fail('host_stopping');
  const proxy = launchProxy(traffic);
  return { arguments: ['--inspect-brk=127.0.0.1:0', `--proxy-server=http=${proxy.host};https=${proxy.host}`] };
}
async function attachClientLaunch({ inspectorUrl, expectedPid, executable, traffic, originalEnvironment, signal }) {
  launchProxy(traffic);
  if (!traffic?.trust?.launchCaPem || !traffic.environmentPatch || !originalEnvironment) throw fail('invalid_launch_configuration');
  if (typeof CODEX_TRAFFIC_MAIN_SOURCE !== 'string') throw fail('launch_bundle_required');
  return attachElectronTrafficBeforeEntry({ inspectorUrl, expectedPid, executable, signal, mainSource: CODEX_TRAFFIC_MAIN_SOURCE,
    configuration: { proxyUrl: traffic.proxyUrl, caPem: traffic.trust.launchCaPem, environmentPatch: traffic.environmentPatch, originalEnvironment,
      runtimeExecutable: process.execPath, privateDirectory: path.dirname(path.dirname(traffic.bundlePath)), originalProxy: { mode: 'system' } } });
}
module.exports = { activate() {}, deactivate() {}, prepareClientLaunch, attachClientLaunch,
  ...require('./codex-traffic.cjs'), ...require('./backend-launch.cjs') };
