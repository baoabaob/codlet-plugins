import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { wrapMcpServers } = createRequire(import.meta.url)('../host/mcp-environment.cjs');
test('stdio MCP wrapper removes inherited launch values and preserves explicit MCP overrides', { timeout: 5000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codlet-mcp-fixture-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const explicit of [false, true]) {
    const environmentPatch = { set: { HTTPS_PROXY: 'http://codlet:fixture@127.0.0.1:9', CODEX_CA_CERTIFICATE: '/private/ca.pem' }, removeCaseInsensitive: ['https_proxy', 'codex_ca_certificate'] };
    const env = { ...process.env, ...environmentPatch.set, EXTRA: 'preserved' };
    if (explicit) env.HTTPS_PROXY = 'http://user-explicit.invalid';
    const servers = { fixture: { enabled: false, command: process.execPath, args: ['-e', 'process.stdout.write(JSON.stringify({proxy:process.env.HTTPS_PROXY,trustAbsent:process.env.CODEX_CA_CERTIFICATE===undefined,extra:process.env.EXTRA}));'], env: explicit ? { HTTPS_PROXY: env.HTTPS_PROXY } : {} } };
    const wrapped = wrapMcpServers({ servers, originalEnvironment: { HTTPS_PROXY: 'http://corporate.invalid' }, environmentPatch, runtimeExecutable: process.execPath, directory }).fixture;
    const child = spawn(wrapped.command, wrapped.args, { env, cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    t.after(() => child.kill()); const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', () => {});
    const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.once('exit', resolve); });
    assert.equal(exit, 0); assert.deepEqual(JSON.parse(Buffer.concat(chunks)), { proxy: explicit ? 'http://user-explicit.invalid' : 'http://corporate.invalid', trustAbsent: true, extra: 'preserved' });
  }
});
