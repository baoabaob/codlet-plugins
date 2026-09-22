'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const fail = code => Object.assign(new Error(code), { code });
function runCleanMcp() {
  const fs = require('node:fs'), { spawn } = require('node:child_process');
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const environment = { ...process.env };
  for (const [name, value] of Object.entries(environment)) {
    if (config.explicit.some(key => key.toLowerCase() === name.toLowerCase())) continue;
    const injected = Object.entries(config.injected).find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (!injected || value !== injected[1]) continue;
    delete environment[name];
    const original = Object.entries(config.original).find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (original) environment[original[0]] = original[1];
  }
  const child = spawn(config.command, config.args, { env: environment, cwd: config.cwd || process.cwd(), windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
  process.stdin.pipe(child.stdin); child.stdout.pipe(process.stdout);
  const stop = () => child.kill();
  process.once('SIGTERM', stop); process.once('SIGINT', stop); process.stdin.once('end', stop);
  child.on('error', () => { process.exitCode = 1; process.stdin.destroy(); });
  child.once('exit', code => { process.exitCode = Number.isInteger(code) ? code : 1; process.stdin.destroy(); });
}
function wrapMcpServers({ servers, environmentPatch, originalEnvironment, runtimeExecutable, directory }) {
  if (!servers || typeof servers !== 'object' || Array.isArray(servers) || Object.keys(servers).length > 128) throw fail('mcp_configuration_unsupported');
  const overrides = {};
  const entry = path.join(directory, `mcp-entry-${randomBytes(16).toString('hex')}.cjs`);
  let written = false;
  for (const [name, server] of Object.entries(servers)) {
    // Desktop can enable an already-configured server per thread. Prepare its
    // transport even while the startup snapshot says enabled:false.
    if (!server.command) continue;
    if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(name)) throw fail('mcp_configuration_unsupported');
    if (typeof server.command !== 'string' || server.args?.some(value => typeof value !== 'string')) throw fail('mcp_configuration_unsupported');
    const filename = path.join(directory, `mcp-${randomBytes(16).toString('hex')}.json`);
    const original = Object.fromEntries(Object.entries(originalEnvironment).filter(([key]) => environmentPatch.removeCaseInsensitive.includes(key.toLowerCase())));
    const config = { command: server.command, args: server.args ?? [], cwd: server.cwd, injected: environmentPatch.set, original, explicit: Object.keys(server.env ?? {}) };
    const text = JSON.stringify(config); if (Buffer.byteLength(text) > 64 * 1024) throw fail('mcp_configuration_unsupported');
    fs.writeFileSync(filename, text, { flag: 'wx', mode: 0o600 });
    if (!written) { fs.writeFileSync(entry, `(${runCleanMcp.toString()})()`, { flag: 'wx', mode: 0o600 }); written = true; }
    overrides[name] = { ...server, command: runtimeExecutable, args: ['--no-addons', '--no-global-search-paths', entry, filename] };
  }
  return overrides;
}
module.exports = { wrapMcpServers, runCleanMcp };
