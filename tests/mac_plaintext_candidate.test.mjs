import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildMacCandidateHost } from '../scripts/build-macos-plaintext-candidate.mjs';

const require = createRequire(import.meta.url);
const candidate = JSON.parse(await fs.readFile(new URL('./fixtures/traffic/mac-plaintext-candidate.json', import.meta.url)));

test('static Mac candidate builds a private Host without promoting the product allowlist', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codlet-mac-candidate-'));
  try {
    const entry = path.join(directory, 'host.cjs');
    await buildMacCandidateHost(entry);
    const privateHost = require(entry);
    const productHost = require('../bundled/codex-desktop-adapter/host.cjs');
    assert.equal(privateHost.probeCodexTraffic({ platform: 'darwin', binarySha256: candidate.backend.sha256 }).fixtureVerified, true);
    assert.equal(productHost.probeCodexTraffic({ platform: 'darwin', binarySha256: candidate.backend.sha256 }).fixtureVerified, false);
    const bytes = await fs.readFile(entry, 'utf8');
    assert(bytes.includes(candidate.main.bootstrap.name));
    assert(bytes.includes(candidate.main.fetch.name));
    assert(bytes.includes(candidate.main.appServer.sha256));
  } finally {
    const resolved = await fs.realpath(directory), temporary = await fs.realpath(os.tmpdir());
    assert.equal(path.dirname(resolved), temporary);
    await fs.rm(resolved, { recursive: true });
  }
});
