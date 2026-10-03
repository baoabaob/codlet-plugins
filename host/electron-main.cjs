'use strict';
const { connectPlaintextSource } = require('./vendor/plaintext-source-client.cjs');
const { installDesktopPlaintext } = require('./electron-plaintext.cjs');
const { installBackendSpawn } = require('./backend-spawn.cjs');
const fail = code => Object.assign(new Error(code), { code });
function localBackends(context, ownsProcess, dependencies = {}) {
  const profiles = dependencies.profiles ?? require('./electron-plaintext.cjs').reviewedSourceProfiles;
  const verify = dependencies.verify ?? require('./backend-launch.cjs').verifyBackend;
  const connections = new Set();
  for (const record of context.modules.list()) {
    const profile = profiles[record.name];
    if (!profile?.connectionSymbol || profile.hash !== record.hash) continue;
    for (const connection of context.modules.instances(record.evaluate(profile.connectionSymbol))) {
      const child = connection.connection?.proc;
      if (!child || connection.disposed || ownsProcess(child) || typeof child.spawnfile !== 'string'
        || !/^codex(?:\.exe)?$/i.test(require('node:path').basename(child.spawnfile))) continue;
      verify(child.spawnfile, process.platform);
      if (connection.getPendingRequestCount() !== 0 || connection.turnCwds?.pendingByStartId?.size
        || connection.turnCwds?.startedByTurnId?.size) throw fail('client_source_backend_busy');
      connections.add(connection);
    }
  }
  return connections;
}
async function recoverLocalBackends(context, ownsProcess, dependencies) {
  // Validate the entire selected local set before reconnecting any member.
  for (const connection of localBackends(context, ownsProcess, dependencies)) {
    await connection.restart({intent: 'restart', killCodexProcess: false});
  }
}

function validateClientSource(electron, context) {
  if (!electron.app.isReady()) return;
  if (!context?.modules) throw fail('client_bridge_required');
  const profiles=require('./electron-plaintext.cjs').reviewedSourceProfiles;
  const kinds=new Set();
  for(const record of context.modules.list()) {
    const profile=profiles[record.name];
    if(profile && profile.hash===record.hash) kinds.add(profile.kind);
  }
  if(!kinds.has('bootstrap')||!kinds.has('main')||!kinds.has('stdio')&&!kinds.has('src')) throw fail('desktop_build_unverified');
  const state=context.resources.get('backendState');
  localBackends(context, child => state.owned.has(child));
}
function installElectronTraffic(electron, configuration, context) {
  if (!configuration?.source || !Number.isSafeInteger(configuration.deadlineUnixMs)) throw fail('invalid_launch_configuration');
  const shared=context?.resources.get('plaintextSource');
  const source = shared ?? connectPlaintextSource(configuration.source);
  let sourceConnected = false, sourceReason = null;
  source.ready.then(() => { sourceConnected = true; }, error => { sourceReason = typeof error?.code === 'string' ? error.code : 'source_unavailable'; });
  let desktop, backend;
  try {
    backend = installBackendSpawn({ source, runtimeExecutable: configuration.runtimeExecutable, deadlineUnixMs: configuration.deadlineUnixMs }, {state:context?.resources.get('backendState'),trackBackend:context?.trackBackend});
    desktop = installDesktopPlaintext(electron, { source, deadlineUnixMs: configuration.deadlineUnixMs,
      ownsBackendProcess: backend.ownsProcess, isProviderSupported: backend.isProviderSupported,
      providerTrustForProcess: backend.providerTrustForProcess,
      pendingAccountUpdate: backend.pendingAccountUpdate, updateAccountMode: backend.updateAccountMode, moduleRegistry:context?.modules });
  } catch (error) { desktop?.close(); backend?.close(); if(!shared)source.close(); throw error; }
  const status = () => ({ installed: true, source: { connected: sourceConnected, reason: sourceReason }, desktop: desktop.inspect(), backend: backend.inspect() });
  return Object.freeze({
    async ready() {
      await source.ready;
      if(context?.modules&&electron.app.isReady()) {
        // A source learned after startup may need one local app-server reconnect;
        // the desktop process and its native pages stay alive. Never interrupt
        // an active turn or replay an outstanding native request.
        await recoverLocalBackends(context, backend.ownsProcess);
      }
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
    async close() { desktop.close(); backend.close(); if(!shared)source.close(); },
  });
}
module.exports = { installElectronTraffic, validateClientSource, recoverLocalBackends };
