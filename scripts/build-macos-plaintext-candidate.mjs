// Test-only Host bundle for the exact static Mac candidate. The resulting file
// stays in the caller's private fixture directory and never changes product
// profiles or generated distribution bytes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = require('../frontend/node_modules/esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const candidatePath = path.join(root, 'tests/fixtures/traffic/mac-plaintext-candidate.json');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const name = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+\.js$/u.test(value);
const symbol = value => typeof value === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/u.test(value);

function addOnce(source, anchor, addition) {
  const at = source.indexOf(anchor);
  if (at < 0 || source.indexOf(anchor, at + anchor.length) >= 0) throw new Error('candidate_source_anchor_changed');
  return source.slice(0, at + anchor.length) + addition + source.slice(at + anchor.length);
}

export async function buildMacCandidateHost(outputPath) {
  if (!path.isAbsolute(outputPath)) throw new Error('candidate_output_must_be_absolute');
  const candidate = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
  if (candidate.status !== 'static-candidate-native-unverified' || candidate.platform !== 'darwin' || candidate.architecture !== 'arm64'
    || !sha(candidate.backend?.sha256) || !['bootstrap', 'fetch', 'appServer'].every(key => name(candidate.main?.[key]?.name) && sha(candidate.main[key].sha256))
    || !symbol(candidate.main.bootstrap.class) || !symbol(candidate.main.fetch.class)
    || !symbol(candidate.main.appServer.stdioClass) || !symbol(candidate.main.appServer.managerExport))
    throw new Error('candidate_profile_invalid');
  const plaintextPath = path.join(root, 'host/electron-plaintext.cjs');
  const trafficPath = path.join(root, 'host/codex-traffic.cjs');
  const plaintext = await fs.readFile(plaintextPath, 'utf8');
  const traffic = await fs.readFile(trafficPath, 'utf8');
  const candidateProfiles = `\n  '${candidate.main.bootstrap.name}': { hash: '${candidate.main.bootstrap.sha256}', kind: 'bootstrap', symbol: '${candidate.main.bootstrap.class}' },`
    + `\n  '${candidate.main.fetch.name}': { hash: '${candidate.main.fetch.sha256}', kind: 'main', symbol: '${candidate.main.fetch.class}' },`
    + `\n  '${candidate.main.appServer.name}': { hash: '${candidate.main.appServer.sha256}', kind: 'src', symbol: '${candidate.main.appServer.stdioClass}', managerExport: '${candidate.main.appServer.managerExport}' },`;
  const patchedPlaintext = addOnce(plaintext, 'const PROFILES = Object.freeze({', candidateProfiles);
  const patchedTraffic = addOnce(traffic, 'const VERIFIED_BACKENDS = Object.freeze({',
    `\n  darwin: Object.freeze([Object.freeze({ sha256: '${candidate.backend.sha256}', version: '${candidate.backend.versionString}', evidence: 'candidate-native-fixture-only' })]),`);
  const vendor = path.join(root, 'host/vendor/plaintext-source-client.cjs');
  const overrides = { name: 'mac-plaintext-candidate', setup(plugin) {
    plugin.onResolve({ filter: /^\.\.\/runtime\/plaintext-source-client\.cjs$/ }, () => ({ path: vendor }));
    plugin.onLoad({ filter: /[\\/]host[\\/]electron-plaintext\.cjs$/ }, args => args.path === plaintextPath ? { contents: patchedPlaintext, loader: 'js' } : undefined);
    plugin.onLoad({ filter: /[\\/]host[\\/]codex-traffic\.cjs$/ }, args => args.path === trafficPath ? { contents: patchedTraffic, loader: 'js' } : undefined);
  } };
  const main = await build({ entryPoints: [path.join(root, 'host/electron-main.cjs')], bundle: true, write: false,
    format: 'cjs', platform: 'node', target: 'node22', plugins: [overrides] });
  const host = await build({ entryPoints: [path.join(root, 'host/desktop-launch.cjs')], bundle: true, write: false,
    format: 'cjs', platform: 'node', target: 'node22', plugins: [overrides],
    define: { CODEX_TRAFFIC_MAIN_SOURCE: JSON.stringify(main.outputFiles[0].text) } });
  await fs.writeFile(outputPath, '// Test-only candidate; not a product profile.\n' + host.outputFiles[0].text);
  return Object.freeze({ outputPath, candidate });
}
