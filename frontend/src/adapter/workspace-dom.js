import { componentSource } from '../host-discovery.js';

export const workspaceError = (code, message) => Object.assign(new Error(message), { code });
export const OWNED = '[data-codlet-workspace-owned]';
export function ancestry(node, limit = 64) {
  const key = node && Object.keys(node).find(key => key.startsWith('__reactFiber$'));
  const result = []; let fiber = key && node[key];
  for (; fiber && result.length < limit; fiber = fiber.return) result.push(fiber);
  return result;
}
export function providersFor(node) {
  const result = [], seen = new Set();
  for (const fiber of ancestry(node, 180)) {
    let count = 0;
    for (let dep = fiber.dependencies?.firstContext; dep && count++ < 128; dep = dep.next) {
      if (!dep.context || seen.has(dep.context)) continue;
      seen.add(dep.context); result.push([dep.context, dep.memoizedValue]);
    }
    if (fiber.tag === 10 && Object.hasOwn(fiber.memoizedProps ?? {}, 'value')) {
      const context = fiber.type?._context ?? fiber.type;
      if (context && !seen.has(context)) { seen.add(context); result.push([context, fiber.memoizedProps.value]); }
    }
  }
  return result;
}
export const wrapProviders = (native, providers, child) => providers.reduce((child, [type, value]) =>
  native.React.createElement(type, { value }, child), child);
const active = node => node.isConnected && !node.closest(`${OWNED},[data-app-shell-active-page="false"]`);
function one(nodes, role, optional = false) {
  const candidates = [...new Set([...nodes].filter(active))];
  if (!candidates.length && optional) return null;
  if (candidates.length !== 1) throw workspaceError(candidates.length ? 'workspace_host_drift' : 'workspace_host_pending', `A unique native ${role} is required (found ${candidates.length})`);
  return candidates[0];
}
export function findWorkspaceSurface(document) {
  const main = one(document.querySelectorAll('main[data-app-shell-main-surface]'), 'main surface', true);
  if (!main) return null;
  const composer = one(main.querySelectorAll('[data-codex-composer-root]'), 'main composer', true);
  const scroller = composer?.closest('.thread-scroll-container') ?? one(main.querySelectorAll('.thread-scroll-container'), 'thread scroller', true);
  if (scroller && !main.contains(scroller)) throw workspaceError('workspace_host_drift', 'The main thread scroller changed ownership');
  const content = scroller?.closest('[data-includes-composer]') ?? null;
  const footer = composer?.closest('[data-thread-scroll-footer]') ?? null;
  if (composer && (!scroller || !content || !footer || !scroller.contains(footer)))
    throw workspaceError('workspace_host_drift', 'The thread body and composer footer no longer match the workspace contract');
  const header = one(document.querySelectorAll('[data-app-shell-main-titlebar]'), 'main titlebar', true);
  const rightPanel = one(document.querySelectorAll('aside[data-app-shell-focus-area="right-panel"]'), 'right resource panel', true);
  return { main, composer, content, scroller, footer, header, rightPanel };
}
export function findActivity(document) {
  const matches = [];
  for (const button of document.querySelectorAll('#root button')) {
    if (!active(button) || button.closest('main')) continue;
    const owner = ancestry(button, 24).find(fiber => {
      const props = fiber.memoizedProps ?? {};
      if (props.description?.props?.id === 'sidebarElectron.priorityThreads.coachmark.description' &&
          props.title?.props?.id === 'sidebarElectron.priorityThreads.filterByPriority' &&
          props.children?.props?.['aria-label'] === button.getAttribute('aria-label')) return true;
      const source = componentSource(fiber.type);
      return source.includes('sidebarElectron.priorityThreads.coachmark.description') && source.includes('onActivate') && source.includes('needsAttention');
    });
    if (owner) matches.push(button);
  }
  return one(matches, 'activity control', true);
}
export function resolveThreadReference(document, element, isCachedLocal = () => false) {
  if (!(element instanceof document.defaultView.Element) || element.ownerDocument !== document || !active(element) || element.closest('main')) return null;
  const title = element.closest('[data-thread-title]');
  if (!title) return null;
  const found = new Map();
  for (const fiber of ancestry(title, 32)) {
    const props = fiber.memoizedProps ?? {};
    const values = [props, props.thread, props.conversation, props.item, props.threadKey];
    for (const value of values) {
      if (!value || typeof value !== 'object') continue;
      const id = value.conversationId ?? value.threadId ?? (value === props ? null : value.id);
      if (typeof id !== 'string' || !/^[\w-]{8,256}$/.test(id)) continue;
      if (value.hostId != null && value.hostId !== 'local' || value.kind != null && !['local', 'codex'].includes(value.kind) || props.itemKind != null && props.itemKind !== 'local') return null;
      if (value.hostId !== 'local' && !['local', 'codex'].includes(value.kind) && props.itemKind !== 'local' && !isCachedLocal(id)) continue;
      found.set(id, { threadId: id, hostId: 'local' });
    }
    if (found.size) break;
  }
  return found.size === 1 ? [...found.values()][0] : null;
}
export function geometry(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return Object.freeze({ element, rect: Object.freeze(Object.fromEntries(['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map(key => [key, rect[key]]))) });
}
const optionDefaults = Object.freeze({ hideBody: false, hideHeader: false, hideComposer: false, composerEnabled: true, rightPanelEnabled: true });
export function surfaceOptions(options, previous = optionDefaults) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !(key in optionDefaults) || typeof options[key] !== 'boolean'))
    throw workspaceError('invalid_argument', 'Invalid surface lease options');
  return { ...previous, ...options };
}
// Journal individual properties, not complete style attributes. Multiple owners
// compose in one pass; a later unrelated page patch keeps its own value.
export function createSurfaceControl() {
  const leases = new Set(), journal = new Map();
  const read = (node, key) => key === 'visibility' ? [node.style.getPropertyValue(key), node.style.getPropertyPriority(key)] : node.getAttribute(key);
  const write = (node, key, value) => {
    if (key === 'visibility') { if (value[0]) node.style.setProperty(key, ...value); else node.style.removeProperty(key); }
    else if (value == null) node.removeAttribute(key); else node.setAttribute(key, value);
  };
  const equal = (a, b) => Array.isArray(a) ? a[0] === b?.[0] && a[1] === b?.[1] : a === b;
  function reconcile(surface) {
    const desired = new Map();
    function suppress(node, hidden, disabled) {
      if (!node || !hidden && !disabled) return;
      const fields = desired.get(node) ?? new Map(); desired.set(node, fields);
      if (hidden) fields.set('visibility', ['hidden', 'important']);
      if (hidden || disabled) { fields.set('inert', ''); fields.set('aria-hidden', 'true'); }
    }
    if (surface?.composer) for (const lease of leases) {
      if (lease.options.hideBody) for (const node of surface.scroller.children)
        if (node !== surface.footer && !node.contains(surface.composer) && !node.matches(OWNED)) suppress(node, true, true);
      suppress(surface.header, lease.options.hideHeader, false);
      suppress(surface.footer, lease.options.hideComposer, !lease.options.composerEnabled);
      suppress(surface.composer, false, !lease.options.composerEnabled);
      suppress(surface.rightPanel, false, !lease.options.rightPanelEnabled);
    }
    for (const [node, fields] of journal) {
      for (const [key, entry] of fields) if (!desired.get(node)?.has(key)) {
        if (equal(read(node, key), entry.applied)) write(node, key, entry.original);
        fields.delete(key);
      }
      if (!fields.size) journal.delete(node);
    }
    for (const [node, fields] of desired) for (const [key, value] of fields) {
      const current = read(node, key); let saved = journal.get(node);
      if (!saved) { saved = new Map(); journal.set(node, saved); }
      let entry = saved.get(key);
      if (!entry) { entry = { original: current, applied: value }; saved.set(key, entry); }
      else if (!equal(current, entry.applied)) entry.original = current;
      if (!equal(current, value)) write(node, key, value);
      entry.applied = value;
    }
  }
  return { leases, reconcile, dispose() { leases.clear(); reconcile(null); } };
}
