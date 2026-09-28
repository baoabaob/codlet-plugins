import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { planForImage } = require('../host/windows-bootstrap.cjs');
const { sameExecutable } = require('../host/electron-bootstrap.cjs');
const hash = 'b6f5c2323c642c3ad3dfdc3501aa94482970f88b4c12db0875ce593aece75c16';
const fuse = { offset: 281415264, version: 1, wire: '010011001' };
test('reviewed disabled inspector yields one reversible data byte; unknown images are rejected', () => {
  assert.deepEqual(planForImage(hash, [fuse]), { moduleData: { module: 'chrome.dll', sha256: hash,
    patches: [{ fileOffset: 281415301, expected: [48], replacement: [49] }] } });
  for (const [sha, matches] of [['0'.repeat(64), [fuse]], [hash, [{ ...fuse, offset: 1 }]], [hash, [{ ...fuse, wire: '000011001' }]]]) {
    assert.throws(() => planForImage(sha, matches), { code: 'client_bootstrap_version_unsupported' });
  }
  assert.throws(() => planForImage(hash, []), { code: 'client_bootstrap_fuse_ambiguous' });
  assert.throws(() => planForImage(hash, [fuse, fuse]), { code: 'client_bootstrap_fuse_ambiguous' });
  assert.throws(() => planForImage(hash, [{ ...fuse, version: 2 }]), { code: 'client_bootstrap_fuse_unsupported' });
  assert.deepEqual(planForImage('old-inspector-enabled', [{ ...fuse, wire: '010111001' }]), { moduleData: null });
});
test('executable comparison accepts equivalent file names without accepting another file', () => {
  assert.equal(sameExecutable(process.execPath, process.execPath), true);
  assert.equal(sameExecutable(process.execPath, import.meta.filename), false);
  assert.equal(sameExecutable(process.execPath, 'relative.exe'), false);
  if (process.platform === 'win32') assert.equal(sameExecutable(process.execPath, `\\\\?\\${process.execPath}`), true);
});
