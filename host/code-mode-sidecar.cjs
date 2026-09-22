'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { createHash } = require('node:crypto');
const fail = code => Object.assign(new Error(code), { code });
const verifiedHash = 'b0deb8a88723e9ff59d2a0bf069f2446a9d14f6d23b91497f2fae58deb3273c6';
function superviseCodeMode() {
  const fs = require('node:fs'), { spawn } = require('node:child_process');
  const [executable, startup] = process.argv.slice(1);
  let captured = '', announced = false;
  const child = spawn(executable, ['--listen', 'grpc://127.0.0.1:0'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const deadline = setTimeout(() => child.kill(), 3000);
  const receive = chunk => {
    if (announced) return; // Continue draining; retain no tool/server output.
    captured += chunk.toString();
    if (captured.length > 8192) { child.kill(); return; }
    const match = /codex-code-mode-host listening on (http:\/\/127\.0\.0\.1:(\d{1,5}))/u.exec(captured);
    if (match && Number(match[2]) > 0 && Number(match[2]) <= 65535) {
      announced = true; captured = ''; clearTimeout(deadline);
      fs.writeFileSync(startup, JSON.stringify({ url: match[1], childPid: child.pid }), { flag: 'wx', mode: 0o600 });
    }
  };
  child.stdout.on('data', receive); child.stderr.on('data', receive);
  const stop = () => child.kill();
  process.stdin.resume(); process.stdin.once('end', stop); process.stdin.once('error', stop);
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  child.once('error', () => { clearTimeout(deadline); process.exitCode = 1; process.stdin.destroy(); });
  child.once('exit', code => { clearTimeout(deadline); process.exitCode = code ?? 1; process.stdin.destroy(); });
}
function startCodeModeSidecar({ backendExecutable, environment, directory, cwd, runtimeExecutable = process.execPath, platform = process.platform }) {
  const executable = path.join(path.dirname(backendExecutable), platform === 'win32' ? 'codex-code-mode-host.exe' : 'codex-code-mode-host');
  const bytes = fs.readFileSync(executable);
  if (platform !== 'win32' || bytes.length > 128 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== verifiedHash) throw fail('code_mode_build_unverified');
  const startup = path.join(directory, 'code-mode-endpoint.json');
  const child = childProcess.spawn(runtimeExecutable, ['--no-addons', '--no-global-search-paths', '--eval', `(${superviseCodeMode.toString()})()`, '--', executable, startup], { env: environment, cwd, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  child.stdin.on('error', () => {});
  let failure;
  child.on('error', () => { failure = 'code_mode_start_failed'; });
  const waiter = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 3500;
  try {
    while (Date.now() < deadline) {
      if (fs.existsSync(startup)) {
        const stat = fs.statSync(startup); if (stat.size > 1024) throw fail('code_mode_start_failed');
        let metadata; try { metadata = JSON.parse(fs.readFileSync(startup, 'utf8')); } catch { Atomics.wait(waiter, 0, 0, 10); continue; }
        const url = new URL(metadata.url);
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || !Number.isSafeInteger(metadata.childPid)) throw fail('code_mode_start_failed');
        fs.unlinkSync(startup);
        return Object.freeze({ url: url.origin, process: child, childPid: metadata.childPid, close() { child.stdin.end(); } });
      }
      if (failure || child.exitCode !== null) throw fail('code_mode_start_failed');
      Atomics.wait(waiter, 0, 0, 10);
    }
    throw fail('code_mode_start_timeout');
  } catch (error) { child.stdin.end(); throw error; }
}
module.exports = { startCodeModeSidecar };
