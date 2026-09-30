// Discover only objects already owned by the mounted Desktop. Never bootstrap a
// new connection, evaluate source text, or use a version number as an ABI test.
const fail = (code, message) => Object.assign(new Error(message), { code });
export function desktopDocument() {
  if (location.origin !== 'app://-' || location.pathname !== '/index.html')
    throw fail('desktop_document_unsupported', 'This is not a Desktop document');
}
export function hostFibers(limit = 20000) {
  const root = document.getElementById('root');
  const key = root && Object.keys(root).find(key => key.startsWith('__reactContainer$'));
  const container = key && root[key], pending = [container?.stateNode?.current ?? container], seen = new Set();
  while (pending.length) {
    const fiber = pending.pop();
    if (!fiber || seen.has(fiber)) continue;
    if (seen.size >= limit) throw fail('desktop_host_drift', 'Desktop tree exceeds the discovery limit');
    seen.add(fiber);
    if (fiber.sibling) pending.push(fiber.sibling);
    if (fiber.child) pending.push(fiber.child);
  }
  return seen;
}
export function loadedAsset(role) {
  desktopDocument();
  if (!['shared', 'initial'].includes(role)) throw fail('desktop_asset_invalid', 'Unknown native module role');
  const pattern = new RegExp('^app://-/assets/app-' + role + '-[A-Za-z0-9_-]+\\.js$');
  const candidates = [...new Set(Array.from(document.querySelectorAll('link[rel="modulepreload"]'), item => item.href).filter(url => pattern.test(url)))];
  if (candidates.length !== 1) throw fail(candidates.length ? 'desktop_asset_ambiguous' : 'ui_host_pending', `A unique loaded Desktop ${role} module is required`);
  return candidates[0];
}
export function localConnection() {
  desktopDocument();
  const nodes = new Set(), matches = new Map();
  for (const fiber of hostFibers()) {
    const chain = fiber.memoizedProps?.value;
    if (!(chain instanceof Map)) continue;
    for (const node of chain.values()) {
      if (!node?.token || chain.get(node.token.id) !== node || !(node.familyBindings instanceof Map) || nodes.has(node)) continue;
      nodes.add(node);
      if (nodes.size > 256 || node.familyBindings.size > 512) throw fail('desktop_scope_drift', 'Desktop scope exceeds the discovery limit');
      const bound = [];
      for (const [family, bindings] of node.familyBindings) {
        if (family?.scope !== node.token || typeof family.read !== 'function' || !(bindings instanceof Map) || !bindings.has('local')) continue;
        // read is called only on a family with an existing local binding.
        const value = family.read(node, chain, 'local');
        bound.push({ family, value });
      }
      for (const { family: managerFamily, value: manager } of bound) {
        if (typeof manager?.getHostId !== 'function' || manager.getHostId() !== 'local' || typeof manager.getConversation !== 'function') continue;
        const client = manager.requestClient;
        const clients = bound.filter(item => item.value === client && typeof client?.sendRequest === 'function' &&
          typeof client.getAppServerVersion === 'function' && typeof client.setAppServerVersion === 'function' && client.requestPromises instanceof Map);
        if (clients.length !== 1) continue;
        const previous = matches.get(manager);
        if (previous && (previous.node !== node || previous.clientFamily !== clients[0].family))
          throw fail('desktop_scope_ambiguous', 'Desktop connection has multiple owners');
        matches.set(manager, { node, chain, managerFamily, clientFamily: clients[0].family, manager, client });
      }
    }
  }
  if (matches.size !== 1) throw fail(matches.size ? 'desktop_scope_ambiguous' : 'desktop_connection_not_ready', 'A unique existing local Desktop connection is required');
  return [...matches.values()][0];
}
export const component = value => typeof value === 'function' ||
  [Symbol.for('react.memo'), Symbol.for('react.forward_ref')].includes(value?.$$typeof);
export function componentSource(value) {
  const fn = typeof value === 'function' ? value : value?.render ?? value?.type;
  return typeof fn === 'function' ? Function.prototype.toString.call(fn) : '';
}
export function uniqueExport(module, predicate, role, optional = false) {
  const values = [...new Set(Object.values(module).filter(predicate))];
  if (!values.length && optional) return undefined;
  if (values.length !== 1) throw fail('desktop_contract_drift', `A unique native ${role} is required (found ${values.length})`);
  return values[0];
}
