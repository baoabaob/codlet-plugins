import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { installBackendSpawn } = createRequire(import.meta.url)('../host/backend-spawn.cjs');
test('main spawn hook restores parent env, changes only verified backend roots and gives code-mode original env', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codlet-spawn-fixture-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const patch = { set: { HTTPS_PROXY: 'http://codlet:private@127.0.0.1:12345', CODEX_CA_CERTIFICATE: '/launch/ca.pem' }, removeCaseInsensitive: ['https_proxy', 'codex_ca_certificate'] };
  const environment = { ...patch.set, OTHER: 'unchanged' }, originalEnvironment = { HTTPS_PROXY: 'http://corporate.invalid:3128', OTHER: 'unchanged' }, dispatched = [];
  const prototype = { spawn(options) { dispatched.push(options); return 'started'; } }; const spawn = prototype.spawn;
  let sidecarStopped = false, sidecarEnvironment;
  const hook = installBackendSpawn({ environmentPatch: patch, originalEnvironment, runtimeExecutable: process.execPath, privateDirectory: directory, deadlineUnixMs: Date.now() + 10000 }, {
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
  assert.equal((await hook.ready()).backendRootsPrepared, 1);
  assert(dispatched[1].args.includes('--code-mode-host')); assert(dispatched[1].envPairs.includes(`HTTPS_PROXY=${patch.set.HTTPS_PROXY}`));
  assert.equal(sidecarEnvironment.HTTPS_PROXY, originalEnvironment.HTTPS_PROXY); assert.equal(sidecarEnvironment.CODEX_CA_CERTIFICATE, undefined);
  assert.equal(sidecarEnvironment.OTHER, 'explicit'); child.emit('exit'); assert.equal(sidecarStopped, true);
  hook.close(); assert.equal(prototype.spawn, spawn); assert.deepEqual(environment, originalEnvironment);
});
test('unverified backend never receives proxy secrets and cannot complete the launch readiness gate', async () => {
  const options = { file: path.resolve('codex.exe'), args: ['codex.exe', 'app-server'], envPairs: ['HTTPS_PROXY=http://original.invalid'] };
  let received;
  const prototype = { spawn(value) { received = value; return 'original'; } };
  const hook = installBackendSpawn({ environmentPatch: { set: { HTTPS_PROXY: 'private' }, removeCaseInsensitive: ['https_proxy'] }, originalEnvironment: {}, deadlineUnixMs: Date.now() + 10000 }, {
    environment: {}, prototype, prepare() { throw Object.assign(new Error('unverified'), { code: 'backend_build_unverified' }); },
  });
  assert.equal(prototype.spawn.call(new EventEmitter(), options), 'original'); assert.equal(received, options);
  await assert.rejects(hook.ready(), { code: 'backend_tool_environment_unsupported' }); hook.close();
});
test('backend readiness uses the shared launch deadline without starting a fresh timeout budget', async () => {
  const prototype = { spawn() {} };
  const hook = installBackendSpawn({ environmentPatch: { set: {}, removeCaseInsensitive: [] }, originalEnvironment: {}, deadlineUnixMs: Date.now() - 1 }, { environment: {}, prototype });
  const started = Date.now();
  await assert.rejects(hook.ready(), { code: 'backend_launch_not_observed' });
  assert(Date.now() - started < 250); hook.close();
});
for (const stage of ['mcp', 'sidecar']) test(`nine unsupported ${stage} preparations retain the original backend and release partial resources`, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codlet-spawn-rollback-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const options = { file: path.join(directory, 'codex.exe'), args: ['codex.exe', 'app-server'], envPairs: ['OTHER=original'] };
  const dispatched = [], prototype = { spawn(value) { dispatched.push(value); return 'original'; } };
  const unsupported = () => { throw Object.assign(new Error('unsupported fixture'), { code: stage === 'mcp' ? 'mcp_configuration_unsupported' : 'code_mode_build_unverified' }); };
  const hook = installBackendSpawn({ environmentPatch: { set: {}, removeCaseInsensitive: [] }, originalEnvironment: {}, privateDirectory: directory }, {
    environment: {}, prototype, prepare: plan => ({ arguments: plan.arguments, environment: plan.originalEnvironment }),
    probe: () => ({ shellPolicy: {}, features: {}, mcpServers: {} }),
    wrapServers(plan) { fs.writeFileSync(path.join(plan.directory, 'partial-wrapper.json'), '{}'); if (stage === 'mcp') unsupported(); return { fixture: { command: 'fixture', args: [] } }; },
    startSidecar: unsupported,
  });
  t.after(() => hook.close());
  for (let index = 0; index < 9; index++) {
    assert.equal(prototype.spawn.call(new EventEmitter(), options), 'original');
    assert.deepEqual(fs.readdirSync(directory), [], 'pre-dispatch rollback removes its partial directory immediately');
  }
  assert.equal(dispatched.length, 9);
  assert(dispatched.every(value => value === options));
  assert.equal(hook.inspect().codeModeSidecars, 0);
  assert.equal(hook.inspect().mcpWrappers, 0, 'failed preparation never reports committed wrappers');
});
