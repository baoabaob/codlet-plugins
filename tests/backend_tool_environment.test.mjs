import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { restoreShellTrafficEnvironment } = createRequire(import.meta.url)('../host/backend-tool-environment.cjs');
test('shell policy removes launch-only proxy/trust and restores only values permitted by original policy', () => {
  const originalEnvironment = { HTTPS_PROXY: 'http://corporate.invalid:3128', CODEX_CA_CERTIFICATE: '/original/ca.pem', OTHER: 'keep' };
  const environmentPatch = { set: { HTTPS_PROXY: 'http://codlet:private@127.0.0.1:32123', HTTP_PROXY: 'http://codlet:private@127.0.0.1:32123', CODEX_CA_CERTIFICATE: '/temporary/ca.pem' }, removeCaseInsensitive: ['https_proxy', 'http_proxy', 'codex_ca_certificate'] };
  const first = restoreShellTrafficEnvironment({ originalEnvironment, environmentPatch });
  assert.deepEqual(first.policy.set, { HTTPS_PROXY: originalEnvironment.HTTPS_PROXY, CODEX_CA_CERTIFICATE: originalEnvironment.CODEX_CA_CERTIFICATE });
  assert(first.policy.exclude.includes('http_proxy')); assert.equal(JSON.stringify(first).includes('private@'), false);
  const filtered = restoreShellTrafficEnvironment({ originalEnvironment, environmentPatch, policy: { exclude: ['*PROXY*'], set: { UNRELATED: 'value' }, include_only: ['CODEX*', 'UNRELATED'] } });
  assert.deepEqual(filtered.policy.set, { CODEX_CA_CERTIFICATE: originalEnvironment.CODEX_CA_CERTIFICATE, UNRELATED: 'value' });
  const none = restoreShellTrafficEnvironment({ originalEnvironment, environmentPatch, policy: { inherit: 'none' } });
  assert.deepEqual(none.policy.set, {}); assert.equal(none.allToolChildrenIsolated, false);
  const override = restoreShellTrafficEnvironment({ originalEnvironment, environmentPatch, policy: { set: { https_proxy: 'http://explicit.invalid' } } });
  assert.equal(override.policy.set.HTTPS_PROXY, undefined); assert.equal(override.policy.set.https_proxy, 'http://explicit.invalid');
  for (const policy of [{ filters: {} }, { experimental_use_profile: true }]) assert.throws(() => restoreShellTrafficEnvironment({ originalEnvironment, environmentPatch, policy }), { code: 'tool_environment_policy_unverified' });
});
