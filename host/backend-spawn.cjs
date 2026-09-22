'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { prepareBackendLaunch, toml } = require('./backend-launch.cjs');
const { runConfigProbe } = require('./backend-config-probe.cjs');
const { startCodeModeSidecar } = require('./code-mode-sidecar.cjs');
const { wrapMcpServers } = require('./mcp-environment.cjs');
const fail = code => Object.assign(new Error(code), { code });

// This hook lives in the new owned Electron main process only. It does not
// change system settings or intercept a running user's independent client.
function installBackendSpawn(configuration, dependencies = {}) {
  const processEnvironment = dependencies.environment ?? process.env;
  const prototype = dependencies.prototype ?? childProcess.ChildProcess.prototype;
  const probe = dependencies.probe ?? ((plan) => {
    const result = childProcess.spawnSync(configuration.runtimeExecutable, ['--no-addons', '--no-global-search-paths', '--eval', `(${runConfigProbe.toString()})()`], {
      input: JSON.stringify(plan), env: plan.environment, cwd: plan.cwd, windowsHide: true, encoding: 'utf8', maxBuffer: 256 * 1024, timeout: 4500,
    });
    if (result.error || result.status !== 0) throw fail('backend_config_unavailable');
    let value; try { value = JSON.parse(result.stdout); } catch { throw fail('backend_config_unavailable'); }
    if (value.error) throw fail(value.error); return value;
  });
  const prepare = dependencies.prepare ?? prepareBackendLaunch;
  const startSidecar = dependencies.startSidecar ?? startCodeModeSidecar;
  const wrapServers = dependencies.wrapServers ?? wrapMcpServers;
  const originalSpawn = prototype.spawn;
  const patch = configuration.environmentPatch;
  if (!patch?.set || !Array.isArray(patch.removeCaseInsensitive) || !configuration.originalEnvironment) throw fail('invalid_launch_configuration');
  const affected = new Set(patch.removeCaseInsensitive.map(name => name.toLowerCase()));
  // Undo Native's child proxy patch before any app module can capture its env.
  // Chromium routing is installed separately through session/net and launch args.
  for (const name of Object.keys(processEnvironment)) if (affected.has(name.toLowerCase())) delete processEnvironment[name];
  for (const [name, value] of Object.entries(configuration.originalEnvironment)) if (affected.has(name.toLowerCase()) && typeof value === 'string') processEnvironment[name] = value;
  let closed = false, prepared = 0, declined = 0, mcpWrappers = 0;
  const children = new Set(), directories = new Set();
  function wrapped(options) {
    const args = options?.args;
    if (closed || !Array.isArray(args) || !args.includes('app-server')) return originalSpawn.call(this, options);
    const file = options.file;
    // A similarly named application is never modified. Exact backend build hash
    // is rechecked by prepareBackendLaunch, including CODEX_CLI_PATH overrides.
    if (typeof file !== 'string' || !path.isAbsolute(file) || !/^codex(?:\.exe)?$/iu.test(path.basename(file))) return originalSpawn.call(this, options);
    const environment = {};
    for (const pair of options.envPairs ?? []) { const at = pair.indexOf('=', pair.startsWith('=') ? 1 : 0); if (at > 0) environment[pair.slice(0, at)] = pair.slice(at + 1); }
    const actualArgs = args.slice(1), configArguments = [];
    for (let index = 0; index < actualArgs.length; index++) {
      if (['-c', '--config', '--enable', '--disable', '-p', '--profile'].includes(actualArgs[index])) configArguments.push(actualArgs[index], actualArgs[++index]);
      else if (/^--(?:config|enable|disable|profile)=/u.test(actualArgs[index])) configArguments.push(actualArgs[index]);
    }
    try {
      // Verify identity before starting even the read-only configuration probe.
      prepare({ executable: file, arguments: actualArgs, originalEnvironment: environment, environmentPatch: patch, shellPolicy: {}, platform: process.platform });
      const policy = probe({ executable: file, configArguments, environment, cwd: options.cwd ?? process.cwd() });
      const launch = prepare({ executable: file, arguments: actualArgs, originalEnvironment: environment, environmentPatch: patch, shellPolicy: policy.shellPolicy, platform: process.platform });
      if (directories.size >= 8) throw fail('backend_launch_limit');
      const directory = fs.mkdtempSync(path.join(configuration.privateDirectory, 'backend-tools-')); directories.add(directory);
      const extra = [];
      const wrappers = wrapServers({ servers: policy.mcpServers ?? {}, environmentPatch: patch, originalEnvironment: environment, runtimeExecutable: configuration.runtimeExecutable, directory });
      mcpWrappers += Object.keys(wrappers).length;
      for (const [name, value] of Object.entries(wrappers)) {
        extra.push('-c', `mcp_servers.${name}.command=${toml(value.command)}`, '-c', `mcp_servers.${name}.args=${toml(value.args)}`);
      }
      let sidecar;
      if (policy.features?.code_mode_host !== false && !actualArgs.some(value => value === '--code-mode-host' || value.startsWith('--code-mode-host='))) {
        sidecar = startSidecar({ backendExecutable: file, environment, directory, cwd: options.cwd ?? process.cwd(), runtimeExecutable: configuration.runtimeExecutable }); children.add(sidecar);
        extra.push('--code-mode-host', sidecar.url);
      }
      const next = { ...options, args: [args[0], ...launch.arguments, ...extra], envPairs: Object.entries(launch.environment).map(([name, value]) => `${name}=${value}`) };
      let retired = false;
      const cleanup = () => {
        if (retired) return; retired = true;
        const remove = () => fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).then(() => directories.delete(directory), () => {});
        if (sidecar) {
          if (sidecar.process && sidecar.process.exitCode === null && sidecar.process.signalCode === null) sidecar.process.once('exit', remove); else remove();
          sidecar.close(); children.delete(sidecar);
        } else remove();
      };
      this.once('exit', cleanup); this.once('error', cleanup);
      try { const result = originalSpawn.call(this, next); prepared++; return result; }
      catch (error) { cleanup(); throw error; }
    } catch (error) {
      declined++;
      // Unsupported tool inheritance keeps the original backend fully usable.
      // Coverage remains false; do not partially proxy a backend that leaks CA.
      if (['backend_build_unverified', 'code_mode_build_unverified', 'tool_environment_policy_unverified', 'mcp_configuration_unsupported'].includes(error.code)) return originalSpawn.call(this, options);
      throw error;
    }
  }
  prototype.spawn = wrapped;
  return Object.freeze({
    async ready() {
      const deadline = Date.now() + 4000;
      while (!prepared) {
        if (closed || declined) throw fail('backend_tool_environment_unsupported');
        if (Date.now() >= deadline) throw fail('backend_launch_not_observed');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return this.inspect();
    },
    close() { if (closed) return; closed = true; if (prototype.spawn === wrapped) prototype.spawn = originalSpawn; for (const child of children) child.close(); children.clear();
      // Native removes its private directory after its owned process tree exits.
    },
    inspect: () => ({ installed: !closed, backendRootsPrepared: prepared, backendRootsDeclined: declined, codeModeSidecars: children.size, mcpWrappers, allToolChildrenIsolated: false, reason: declined ? 'backend_tool_environment_unsupported' : prepared ? 'startup-snapshot-covered' : 'awaiting_backend_launch' }) });
}
module.exports = { installBackendSpawn };
