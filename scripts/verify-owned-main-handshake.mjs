// Attach only to the exact new child already paused by Native. This script does
// not discover, start, terminate or operate on any existing user client.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const { attachClientLaunch } = createRequire(import.meta.url)('../bundled/codex-desktop-adapter/host.cjs');
const args = process.argv.slice(2), values = {};
for (let index = 0; index < args.length; index += 2) {
  if (!['--owned-pid', '--executable', '--inspector-file', '--traffic-file', '--original-environment-file'].includes(args[index]) || args[index + 1] == null) throw new Error('invalid_arguments');
  values[args[index]] = args[index + 1];
}
const expectedPid = Number(values['--owned-pid']);
if (!Number.isSafeInteger(expectedPid) || expectedPid <= 0 || !path.isAbsolute(values['--executable'] ?? '')) throw new Error('owned_process_identity_required');
async function read(file, json = true) {
  if (!path.isAbsolute(file ?? '')) throw new Error('private_file_required');
  const handle = await fs.open(file, 'r');
  try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('private_file_invalid'); const text = await handle.readFile('utf8'); return json ? JSON.parse(text) : text.trim(); }
  finally { await handle.close(); }
}
const signal = AbortSignal.timeout(10000);
try {
  const [inspectorUrl, traffic, originalEnvironment] = await Promise.all([read(values['--inspector-file'], false), read(values['--traffic-file']), read(values['--original-environment-file'])]);
  const result = await attachClientLaunch({ inspectorUrl, expectedPid, executable: values['--executable'], traffic, originalEnvironment, signal });
  process.stdout.write(JSON.stringify({ installed: result.installed === true, exactChildVerified: result.exactChildVerified === true, configuredSessions: result.configuredSessions, actualTrafficObserved: false }) + '\n');
} catch (error) {
  const allowed = new Set(['invalid_main_bootstrap', 'main_bootstrap_cancelled', 'main_bootstrap_protocol_failed', 'main_bootstrap_timeout', 'main_bootstrap_connect_failed', 'main_bootstrap_not_paused', 'main_bootstrap_identity_mismatch', 'main_bootstrap_install_failed', 'main_bootstrap_session_failed']);
  process.stdout.write(JSON.stringify({ installed: false, reason: allowed.has(error.code) ? error.code : 'main_handshake_failed' }) + '\n'); process.exitCode = 1;
}
