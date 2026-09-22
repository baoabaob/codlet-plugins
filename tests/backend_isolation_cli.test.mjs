import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { startCodeModeSidecar } = require('../host/code-mode-sidecar.cjs');
const { wrapMcpServers } = require('../host/mcp-environment.cjs');
const { prepareBackendLaunch, toml } = require('../host/backend-launch.cjs');
const { installBackendSpawn } = require('../host/backend-spawn.cjs');
test('real isolated backend connects clean code-mode sidecar, restores shell and explicit env, and starts clean MCP', { skip: !process.env.CODLET_TRAFFIC_BACKEND, timeout: 30000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codlet-downstream-'));
  let hook, child, lines; const pending = new Map();
  t.after(async () => {
    for (const call of pending.values()) clearTimeout(call.timer); lines?.close();
    const reap = async value => { if (!value || value.exitCode !== null || value.signalCode !== null) return; const exited = new Promise(resolve => value.once('exit', resolve)); value.kill(); await exited; };
    await reap(child); hook?.close();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP)$/iu.test(key)));
  Object.assign(environment, { CODEX_HOME: directory, HOME: directory, USERPROFILE: directory, HTTPS_PROXY: 'http://original.invalid:3128' });
  const caPath = path.join(directory, 'launch-ca.pem'); await fs.copyFile(new URL('./fixtures/traffic/ca.pem', import.meta.url), caPath);
  const patch = { set: { HTTP_PROXY: 'http://codlet:fixture@127.0.0.1:9', HTTPS_PROXY: 'http://codlet:fixture@127.0.0.1:9', CODEX_CA_CERTIFICATE: caPath }, removeCaseInsensitive: ['http_proxy', 'https_proxy', 'all_proxy', 'codex_ca_certificate'] };
  const marker = path.join(directory, 'mcp-counters.json');
  const server = { command: process.execPath, args: [fileURLToPath(new URL('./fixtures/traffic/mcp-env-server.cjs', import.meta.url)), marker], env_vars: ['HTTPS_PROXY'], env: { MCP_FIXTURE_EXPLICIT: 'user-value' } };
  hook = installBackendSpawn({ environmentPatch: patch, originalEnvironment: environment, runtimeExecutable: process.execPath, privateDirectory: directory }, { environment: { ...environment, ...patch.set } });
  child = spawn(process.env.CODLET_TRAFFIC_BACKEND, ['app-server', '--stdio', '-c', 'features.code_mode_host=true', '-c', `mcp_servers.env_fixture=${toml(server)}`, '-c', 'analytics.enabled=false'], { env: environment, cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal(hook.inspect().backendRootsPrepared, 1); assert.equal(hook.inspect().codeModeSidecars, 1);
  assert.equal(hook.inspect().mcpWrappers, 1);
  let sequence = 0;
  lines = createInterface({ input: child.stdout }); child.stderr.on('data', () => {});
  lines.on('line', line => { let value; try { value = JSON.parse(line); } catch { return; } const call = pending.get(value.id); if (!call) return; clearTimeout(call.timer); pending.delete(value.id); value.error ? call.reject(Object.assign(new Error('backend_rpc_failed'), { method: call.method, rpcCode: value.error.code })) : call.resolve(value.result); });
  const request = (method, params) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { method, resolve, reject, timer: setTimeout(() => reject(new Error(`fixture_timeout:${method}`)), 12000) }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); });
  await request('initialize', { clientInfo: { name: 'codlet-downstream-fixture', version: '1' }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  const command = [process.execPath, '-e', 'process.stdout.write(JSON.stringify({proxy:process.env.HTTPS_PROXY,trustAbsent:process.env.CODEX_CA_CERTIFICATE===undefined,httpAbsent:process.env.HTTP_PROXY===undefined}))'];
  const normal = await request('command/exec', { command, cwd: directory, sandboxPolicy: { type: 'readOnly' }, timeoutMs: 5000 });
  assert.equal(normal.exitCode, 0); assert.deepEqual(JSON.parse(normal.stdout), { proxy: environment.HTTPS_PROXY, trustAbsent: true, httpAbsent: true });
  const explicit = await request('command/exec', { command, cwd: directory, env: { HTTPS_PROXY: 'http://explicit.invalid' }, sandboxPolicy: { type: 'readOnly' }, timeoutMs: 5000 });
  assert.equal(JSON.parse(explicit.stdout).proxy, 'http://explicit.invalid');
  const started = await request('thread/start', { cwd: directory, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true });
  assert(started.thread.id);
  for (let attempt = 0; ; attempt++) {
    try { const report = JSON.parse(await fs.readFile(marker, 'utf8')); assert.deepEqual(report, { proxyRestored: true, trustRemoved: true, explicitPreserved: true }); break; }
    catch (error) { if (error.code !== 'ENOENT' || attempt >= 80) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal(hook.inspect().codeModeSidecars, 1);
});
