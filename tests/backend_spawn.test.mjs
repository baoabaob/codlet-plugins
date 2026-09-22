import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { installBackendSpawn } = createRequire(import.meta.url)('../host/backend-spawn.cjs');
test('main spawn hook restores parent env, changes only verified backend roots and gives code-mode original env', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codlet-spawn-fixture-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const patch = { set: { HTTPS_PROXY: 'http://codlet:private@127.0.0.1:12345', CODEX_CA_CERTIFICATE: '/launch/ca.pem' }, removeCaseInsensitive: ['https_proxy', 'codex_ca_certificate'] };
  const environment = { ...patch.set, OTHER: 'unchanged' }, originalEnvironment = { HTTPS_PROXY: 'http://corporate.invalid:3128', OTHER: 'unchanged' }, dispatched = [];
  const prototype = { spawn(options) { dispatched.push(options); return 'started'; } }; const spawn = prototype.spawn;
  let sidecarStopped = false, sidecarEnvironment;
  const hook = installBackendSpawn({ environmentPatch: patch, originalEnvironment, runtimeExecutable: process.execPath, privateDirectory: directory }, {
    environment, prototype, probe: () => ({ shellPolicy: { exclude: ['PRIVATE_*'] }, features: { code_mode_host: true }, mcpServers: {} }),
    prepare: plan => ({ arguments: plan.arguments, environment: { ...plan.originalEnvironment, ...patch.set } }),
    wrapServers: () => ({}), startSidecar(plan) { sidecarEnvironment = plan.environment; return { url: 'http://127.0.0.1:12346', close() { sidecarStopped = true; } }; },
  });
  assert.deepEqual(environment, originalEnvironment);
  const unrelated = { file: process.execPath, args: [process.execPath, '-e', '0'], envPairs: ['HTTPS_PROXY=http://explicit.invalid'] };
  prototype.spawn.call(new EventEmitter(), unrelated); assert.equal(dispatched[0], unrelated);
  const child = new EventEmitter(), executable = path.resolve(directory, 'codex.exe');
  const backend = { file: executable, args: [executable, 'app-server', '--stdio'], cwd: directory, envPairs: ['HTTPS_PROXY=http://corporate.invalid:3128', 'OTHER=explicit'] };
  prototype.spawn.call(child, backend);
  assert(dispatched[1].args.includes('--code-mode-host')); assert(dispatched[1].envPairs.includes(`HTTPS_PROXY=${patch.set.HTTPS_PROXY}`));
  assert.equal(sidecarEnvironment.HTTPS_PROXY, originalEnvironment.HTTPS_PROXY); assert.equal(sidecarEnvironment.CODEX_CA_CERTIFICATE, undefined);
  assert.equal(sidecarEnvironment.OTHER, 'explicit'); child.emit('exit'); assert.equal(sidecarStopped, true);
  hook.close(); assert.equal(prototype.spawn, spawn); assert.deepEqual(environment, originalEnvironment);
});
