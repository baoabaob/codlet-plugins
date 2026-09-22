'use strict';
const fail = code => Object.assign(new Error(code), { code });
const match = (name, pattern) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*').replaceAll('?', '.') + '$', 'iu').test(name);
const matches = (name, patterns) => patterns.some(pattern => match(name, pattern));

// Called with the effective policy resolved BEFORE proxy injection. This is a
// shell-tool policy adapter, not proof that every backend subprocess uses it.
function restoreShellTrafficEnvironment({ originalEnvironment, environmentPatch, policy = {} }) {
  if (policy.experimental_use_profile === true || policy.use_profile === true) throw fail('tool_environment_policy_unverified');
  const canonical = policy.filters != null;
  if (canonical) {
    if (policy.exclude != null || policy.include_only != null || typeof policy.filters !== 'object' || Array.isArray(policy.filters)) throw fail('invalid_tool_environment');
    const exclude = [], include_only = [];
    for (const [key, action] of Object.entries(policy.filters)) {
      if (!['include', 'exclude'].includes(action)) throw fail('invalid_tool_environment');
      (action === 'include' ? include_only : exclude).push(key);
    }
    policy = { ...policy, exclude, include_only };
  }
  const inherit = policy.inherit ?? 'all';
  if (!['all', 'core', 'none'].includes(inherit) || typeof originalEnvironment !== 'object' || !environmentPatch?.set || !Array.isArray(environmentPatch.removeCaseInsensitive)) throw fail('invalid_tool_environment');
  for (const values of [policy.exclude ?? [], policy.include_only ?? []]) if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || value.length > 512)) throw fail('invalid_tool_environment');
  const affected = new Set([...environmentPatch.removeCaseInsensitive, ...Object.keys(environmentPatch.set)].map(name => name.toLowerCase()));
  if ([...affected].some(name => !/^(https?_proxy|all_proxy|[a-z][a-z0-9_]{0,127})$/u.test(name))) throw fail('invalid_tool_environment');
  const restored = {};
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (!affected.has(name.toLowerCase()) || inherit !== 'all') continue;
    if (policy.ignore_default_excludes === false && matches(name, ['*KEY*', '*SECRET*', '*TOKEN*'])) continue;
    if (matches(name, policy.exclude ?? []) || (policy.include_only?.length && !matches(name, policy.include_only))) continue;
    if (typeof value === 'string') restored[name] = value;
  }
  for (const name of Object.keys(policy.set ?? {})) {
    if (typeof policy.set[name] !== 'string') throw fail('invalid_tool_environment');
    for (const existing of Object.keys(restored)) if (existing.toLowerCase() === name.toLowerCase()) delete restored[existing];
  }
  const set = { ...restored, ...policy.set };
  const exclude = [...new Set([...(policy.exclude ?? []), ...affected])];
  let updated = { ...policy, exclude, set };
  if (canonical) {
    const filters = { ...policy.filters };
    for (const name of affected) {
      if (Object.entries(filters).some(([key, value]) => key.toLowerCase() === name && value === 'include')) throw fail('tool_environment_policy_unverified');
      for (const key of Object.keys(filters)) if (key.toLowerCase() === name) delete filters[key];
      filters[name] = 'exclude';
    }
    updated = { ...policy, filters, set }; delete updated.exclude; delete updated.include_only;
  }
  return Object.freeze({ policy: Object.freeze(updated),
    coverage: 'shell-environment-policy-only', allToolChildrenIsolated: false,
    unsupported: Object.freeze(['mcp-process-inheritance', 'code-mode-host-inheritance', 'per-request-env-overrides', 'shell-profile-restoration']) });
}
module.exports = { restoreShellTrafficEnvironment };
