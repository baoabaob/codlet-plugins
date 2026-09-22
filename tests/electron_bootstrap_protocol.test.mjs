import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { attachElectronTrafficBeforeEntry } = createRequire(import.meta.url)('../host/electron-bootstrap.cjs');
test('real Node inspector pauses before entry, binds identity, installs main hook, resumes and detaches', { timeout: 12000 }, async t => {
  const controller = new AbortController();
  const child = spawn(process.execPath, ['--require', fileURLToPath(new URL('./fixtures/traffic/main-preload.cjs', import.meta.url)), '--inspect-brk=127.0.0.1:0', fileURLToPath(new URL('./fixtures/traffic/main-entry.cjs', import.meta.url))], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(async () => { controller.abort(); if (child.exitCode === null && child.signalCode === null) { const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended; } });
  const inspectorUrl = await new Promise((resolve, reject) => {
    let buffer = ''; const timer = setTimeout(() => reject(new Error('inspector_not_listening')), 5000);
    child.once('error', reject);
    child.stderr.on('data', bytes => {
      if (buffer.length > 8192) { clearTimeout(timer); reject(new Error('inspector_output_limit')); return; }
      buffer += bytes.toString(); const found = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]{36})/u.exec(buffer);
      if (found) { clearTimeout(timer); resolve(found[1]); }
    });
  });
  const caPem = await fs.readFile(new URL('./fixtures/traffic/ca.pem', import.meta.url), 'utf8');
  const result = await attachElectronTrafficBeforeEntry({ inspectorUrl, expectedPid: child.pid, executable: process.execPath,
    configuration: { proxyUrl: 'http://codlet:fixture@127.0.0.1:12345', caPem }, signal: controller.signal });
  assert.equal(result.installed, true); assert.equal(result.exactChildVerified, true); assert.equal(result.configuredSessions, 1);
  assert.equal(result.desktopTrafficVerified, false, 'fixture protocol is not real official Desktop acceptance');
});
