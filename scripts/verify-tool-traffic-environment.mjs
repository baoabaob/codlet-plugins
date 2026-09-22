// Isolated real-backend probe; no model call, credentials or user config.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
const { restoreShellTrafficEnvironment } = createRequire(import.meta.url)('../host/backend-tool-environment.cjs');
const executable = process.argv[2];
if (!executable || !path.isAbsolute(executable)) throw new Error('Pass an absolute official backend executable');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codlet-tool-env-'));
const patch = { set: { HTTP_PROXY: 'http://codlet:fixture-not-real@127.0.0.1:9', HTTPS_PROXY: 'http://codlet:fixture-not-real@127.0.0.1:9', CODEX_CA_CERTIFICATE: path.join(directory, 'launch-ca.pem') }, removeCaseInsensitive: ['http_proxy', 'https_proxy', 'all_proxy', 'codex_ca_certificate'] };
const originalEnvironment = { HTTP_PROXY: 'http://corporate.invalid:3128' };
const restored = restoreShellTrafficEnvironment({ originalEnvironment, environmentPatch: patch });
const toml = value => typeof value === 'string' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(toml).join(',')}]` : `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`).join(',')}}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(path|systemroot|windir|comspec|pathext|temp|tmp)$/iu.test(name)));
Object.assign(env, patch.set, { CODEX_HOME: directory, HOME: directory, USERPROFILE: directory });
await fs.copyFile(new URL('../tests/fixtures/traffic/ca.pem', import.meta.url), patch.set.CODEX_CA_CERTIFICATE);
let child, reader; const pending = new Map(); let sequence = 0;
try {
  child = spawn(executable, ['-c', `shell_environment_policy.exclude=${toml(restored.policy.exclude)}`, '-c', `shell_environment_policy.set=${toml(restored.policy.set)}`, '-c', 'analytics.enabled=false', 'app-server', '--stdio'], { env, cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {});
  reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    let value; try { value = JSON.parse(line); } catch { return; }
    const call = pending.get(value.id); if (!call) return;
    pending.delete(value.id); clearTimeout(call.timer);
    if (value.error) call.reject(new Error('backend_rpc_rejected')); else call.resolve(value.result);
  });
  child.on('error', () => { for (const value of pending.values()) value.reject(new Error('backend_spawn_failed')); });
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('backend_probe_timeout')); }, 20000);
      pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  await request('initialize', { clientInfo: { name: 'codlet-tool-env-fixture', version: '1' }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  const result = await request('command/exec', { command: [process.execPath, '-e', 'process.stdout.write(JSON.stringify({originalProxy:process.env.HTTP_PROXY==="http://corporate.invalid:3128",launchHttpsAbsent:process.env.HTTPS_PROXY===undefined,launchTrustAbsent:process.env.CODEX_CA_CERTIFICATE===undefined}))'], cwd: directory, timeoutMs: 10000, outputBytesCap: 2048, sandboxPolicy: { type: 'readOnly' } });
  let observed; try { observed = JSON.parse(result.stdout); } catch { throw new Error('backend_probe_output_invalid'); }
  const passed = result.exitCode === 0 && Object.values(observed).every(value => value === true);
  process.stdout.write(JSON.stringify({ passed, scope: 'command/exec', observed, allToolChildrenIsolated: false }) + '\n');
  if (!passed) process.exitCode = 1;
} catch (error) {
  process.stdout.write(JSON.stringify({ passed: false, reason: error.message, allToolChildrenIsolated: false }) + '\n'); process.exitCode = 1;
} finally {
  for (const call of pending.values()) clearTimeout(call.timer); pending.clear();
  reader?.close(); if (child) { const ended = new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); }); child.kill(); await ended; }
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
