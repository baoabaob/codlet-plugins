'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { probeCodexTraffic } = require('./codex-traffic.cjs');
const { restoreShellTrafficEnvironment } = require('./backend-tool-environment.cjs');
const fail = code => Object.assign(new Error(code), { code });
const toml = value => typeof value === 'string' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(toml).join(',')}]` : `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`).join(',')}}`;
function prepareBackendLaunch({ executable, arguments: args, originalEnvironment, environmentPatch, shellPolicy, platform = process.platform }) {
  if (!path.isAbsolute(executable) || !Array.isArray(args) || args.some(value => typeof value !== 'string') || !args.includes('app-server')) throw fail('invalid_backend_launch');
  const fd = fs.openSync(executable, 'r'); let binarySha256;
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > 256 * 1024 * 1024) throw fail('backend_build_unverified');
    const hash = createHash('sha256'), bytes = Buffer.alloc(64 * 1024);
    for (;;) { const count = fs.readSync(fd, bytes); if (!count) break; hash.update(bytes.subarray(0, count)); }
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw fail('backend_build_unverified');
    binarySha256 = hash.digest('hex');
  } finally { fs.closeSync(fd); }
  if (!probeCodexTraffic({ platform, binarySha256 }).fixtureVerified) throw fail('backend_build_unverified');
  const restored = restoreShellTrafficEnvironment({ originalEnvironment, environmentPatch, policy: shellPolicy });
  const environment = Object.fromEntries(Object.entries(originalEnvironment).filter(([name]) => !environmentPatch.removeCaseInsensitive.includes(name.toLowerCase())));
  Object.assign(environment, environmentPatch.set);
  // Last config overrides win. No persistent config is written and the user's
  // original effective shell policy is preserved apart from traffic variables.
  return Object.freeze({ executable, arguments: Object.freeze([...args, '-c', `shell_environment_policy.exclude=${toml(restored.policy.exclude)}`, '-c', `shell_environment_policy.set=${toml(restored.policy.set)}`]),
    environment: Object.freeze(environment), compatibility: Object.freeze({ platform, binarySha256 }),
    status: Object.freeze({ available: false, backendEnvironmentPrepared: true, shellEnvironmentPrepared: true, allToolChildrenIsolated: false, reason: 'non_shell_tool_children_unverified' }) });
}
module.exports = { prepareBackendLaunch };
