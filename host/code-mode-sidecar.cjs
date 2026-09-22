'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { createHash } = require('node:crypto');
const fail = code => Object.assign(new Error(code), { code });
const verifiedHash = 'b0deb8a88723e9ff59d2a0bf069f2446a9d14f6d23b91497f2fae58deb3273c6';
function startCodeModeSidecar({ backendExecutable, environment, directory, cwd, platform = process.platform }) {
  const executable = path.join(path.dirname(backendExecutable), platform === 'win32' ? 'codex-code-mode-host.exe' : 'codex-code-mode-host');
  const bytes = fs.readFileSync(executable);
  if (platform !== 'win32' || bytes.length > 128 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== verifiedHash) throw fail('code_mode_build_unverified');
  const startup = path.join(directory, 'code-mode-startup.log');
  const output = fs.openSync(startup, 'wx', 0o600);
  let child;
  try {
    child = childProcess.spawn(executable, ['--listen', 'grpc://127.0.0.1:0'], { env: environment, cwd, windowsHide: true, stdio: ['ignore', output, output] });
  } finally { fs.closeSync(output); }
  let failure;
  child.on('error', () => { failure = 'code_mode_start_failed'; });
  const waiter = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 3000;
  try {
    while (Date.now() < deadline) {
      const stat = fs.statSync(startup); if (stat.size > 8192) throw fail('code_mode_start_failed');
      const text = fs.readFileSync(startup, 'utf8');
      const match = /codex-code-mode-host listening on (http:\/\/127\.0\.0\.1:(\d{1,5}))/u.exec(text);
      if (match && Number(match[2]) > 0 && Number(match[2]) <= 65535) return Object.freeze({ url: match[1], process: child, close() { child.kill(); } });
      if (failure || child.exitCode !== null) throw fail('code_mode_start_failed');
      Atomics.wait(waiter, 0, 0, 10);
    }
    throw fail('code_mode_start_timeout');
  } catch (error) { child.kill(); throw error; }
}
module.exports = { startCodeModeSidecar };
