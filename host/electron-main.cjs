'use strict';
const { connectPlaintextSource } = require('../runtime/plaintext-source-client.cjs');
const { installDesktopPlaintext } = require('./electron-plaintext.cjs');
const { installBackendSpawn } = require('./backend-spawn.cjs');
const fail = code => Object.assign(new Error(code), { code });

function installElectronTraffic(electron, configuration) {
  if (!configuration?.source || !Number.isSafeInteger(configuration.deadlineUnixMs)) throw fail('invalid_launch_configuration');
  const source = connectPlaintextSource(configuration.source);
  let sourceConnected = false, sourceReason = null;
  source.ready.then(() => { sourceConnected = true; }, error => { sourceReason = typeof error?.code === 'string' ? error.code : 'source_unavailable'; });
  let desktop, backend;
  try {
    backend = installBackendSpawn({ source, runtimeExecutable: configuration.runtimeExecutable, deadlineUnixMs: configuration.deadlineUnixMs });
    desktop = installDesktopPlaintext(electron, { source, deadlineUnixMs: configuration.deadlineUnixMs,
      ownsBackendProcess: backend.ownsProcess, isProviderSupported: backend.isProviderSupported,
      providerTrustForProcess: backend.providerTrustForProcess,
      pendingAccountUpdate: backend.pendingAccountUpdate, updateAccountMode: backend.updateAccountMode });
  } catch (error) { desktop?.close(); backend?.close(); source.close(); throw error; }
  const status = () => ({ installed: true, source: { connected: sourceConnected, reason: sourceReason }, desktop: desktop.inspect(), backend: backend.inspect() });
  return Object.freeze({
    async ready() {
      await source.ready;
      const [desktopState, backendState] = await Promise.all([desktop.ready(), backend.ready()]);
      const activatedSources = [], unsupportedSources = [];
      if (desktopState.available) activatedSources.push({ id: 'desktop-main-http', operations: ['http.intercept'], protocols: ['http', 'sse'],
        coverage: ['desktop-main-fetch', 'desktop-main-upload-progress'] });
      else unsupportedSources.push({ id: 'desktop-main-http', reason: ['unsupported_build', 'timeout'].includes(desktopState.reason) ? desktopState.reason : 'hook_unavailable' });
      if (backendState.available && desktopState.taskConfigurationAvailable) activatedSources.push({ id: 'owned-backend-provider', operations: ['route.register', 'route.update', 'route.close', 'http.intercept'],
        protocols: ['http', 'sse', 'webSocket'], coverage: ['owned-local-app-server-model-provider'] });
      else unsupportedSources.push({ id: 'owned-backend-provider', reason: !desktopState.taskConfigurationAvailable
        ? desktopState.taskConfigurationReason === 'unsupported_build' ? 'unsupported_build' : 'hook_unavailable'
        : backendState.reason === 'child_unavailable' ? 'child_unavailable' : 'route_unavailable' });
      return { installed: activatedSources.length > 0, activatedSources, unsupportedSources };
    },
    inspect: status,
    async close() { backend.close(); desktop.close(); source.close(); },
  });
}
module.exports = { installElectronTraffic };
