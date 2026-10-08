import { desktopDocument } from '../host-discovery.js';
import { subscribeNativeRoute } from '../native-navigation.js';
import { OWNED, workspaceError, findWorkspaceSurface, findActivity, resolveThreadReference, geometry, createSurfaceControl, surfaceOptions } from './workspace-dom.js';
import { createWorkspaceDiscovery } from './workspace-discovery.js';
import { createTranscripts } from './workspace-transcript.js';
import { createShortcuts } from './workspace-shortcuts.js';

export const WORKSPACE_CAPABILITY = Object.freeze({ name: 'codex.ui.workspace', api: 1, scope: 'target' });
export const WORKSPACE_SYMBOL = 'codlet.codex.ui.workspace.v1';
const emptyFeatures = () => ({ surface: false, activitySlot: false, transcript: false, shortcuts: false });
const roleNames = ['main', 'content', 'scroller', 'composer', 'footer', 'header', 'rightPanel'];
const errorValue = error => ({ code: typeof error?.code === 'string' ? error.code : 'workspace_host_drift', message: String(error?.message ?? error) });

export function createWorkspace(context, { locate, baseNative, discovery: suppliedDiscovery, document: doc = document,
    requestFrame = callback => requestAnimationFrame(callback), cancelFrame = id => cancelAnimationFrame(id), validateDocument = desktopDocument } = {}) {
  const symbol = Symbol.for(WORKSPACE_SYMBOL), tickets = new Map(), sessions = new Set(), slots = new Set(), control = createSurfaceControl();
  if (globalThis[symbol] !== undefined) throw workspaceError('workspace_host_drift', 'Another workspace provider owns this document');
  let alive = true, frame = null, observer, resize, host, root, unroute, structural = true, surface, activity, features = emptyFeatures(), diagnostic = null, surfaceFailure = null, revision = 0;
  let snapshot = Object.freeze({ api: 1, revision, route: null, threadId: null, hostId: null, auxiliary: false, available: false, features: Object.freeze(features), diagnostic: null });
  let publicSurface = Object.freeze({ available: false, ...Object.fromEntries(roleNames.map(key => [key, null])) }), geometrySignature = '';
  const report = error => { try { context.reportDiagnostic?.({ ...errorValue(error), level: 'warning' }); } catch {} };
  const check = () => { if (!alive) throw workspaceError('workspace_retired', 'Workspace provider retired'); };
  const discovery = suppliedDiscovery ?? createWorkspaceDiscovery(baseNative);
  const featureLoad = (role, load) => Promise.resolve().then(load).then(value => { check(); features = { ...features, [role]: true }; schedule(false); return value; }, error => {
    features = { ...features, [role]: false }; diagnostic = errorValue(error); report(error); schedule(false); throw error;
  });
  const transcripts = createTranscripts({ document: doc, load: () => featureLoad('transcript', discovery.transcript), surface: () => surface, check, report });
  const shortcuts = createShortcuts({ document: doc, load: () => featureLoad('shortcuts', discovery.shortcuts), surface: () => surface, activity: () => activity, check, report, changed: () => schedule(false) });
  function callback(listener, value) { try { Promise.resolve(listener(value)).catch(report); } catch (error) { report(error); } }
  function publish(routeChanged = false) {
    const location = host?.navigator.location, route = location ? { pathname: location.pathname, search: location.search ?? '', hash: location.hash ?? '' } : null;
    const match = route && /^\/local\/([\w-]{8,256})\/?$/.exec(route.pathname), threadId = match?.[1] ?? null;
    const next = { api: 1, route, threadId, hostId: threadId ? 'local' : null, auxiliary: !!host?.auxiliary,
      available: !!surface?.composer && !host?.auxiliary, features, diagnostic };
    const previous = { ...snapshot }; delete previous.revision;
    const changed = routeChanged || geometrySignature !== previousGeometry || JSON.stringify(next) !== JSON.stringify(previous);
    if (!changed) return;
    previousGeometry = geometrySignature;
    snapshot = Object.freeze({ ...next, revision: ++revision, route: route && Object.freeze(route), features: Object.freeze({ ...features }), diagnostic: diagnostic && Object.freeze({ ...diagnostic }) });
    for (const session of sessions) for (const listener of session.listeners) callback(listener, snapshot);
  }
  let previousGeometry = '';
  let microtaskSequence = 0;
  function refreshGeometry() {
    publicSurface = Object.freeze({ available: !!surface?.composer && !host?.auxiliary, ...Object.fromEntries(roleNames.map(key => [key, geometry(surface?.[key])])) });
    geometrySignature = JSON.stringify(roleNames.map(key => publicSurface[key]?.rect ?? null));
  }
  function reconcile() {
    frame = null; if (!alive || !sessions.size) return;
    let routeChanged = false;
    try {
      if (!root?.isConnected || root !== doc.getElementById('root') || !host) {
        validateDocument(); host = locate(); root = host.rootNode;
        unroute?.(); unroute = subscribeNativeRoute(host.navigator, () => schedule(true));
      }
      routeChanged = host.navigator.location.pathname !== snapshot.route?.pathname;
      const oldSurface = surface;
      if (structural || routeChanged) {
        structural = false;
        surface = host.auxiliary ? null : findWorkspaceSurface(doc);
        if (!activity?.isConnected && !host.auxiliary && (slots.size || features.shortcuts)) activity = findActivity(doc);
        features = { ...features, surface: !!surface?.composer, activitySlot: !!activity, transcript: host.auxiliary ? false : features.transcript, shortcuts: host.auxiliary ? false : features.shortcuts };
        if (diagnostic === surfaceFailure) diagnostic = surfaceFailure = null;
        if (resize && oldSurface !== surface) {
          resize.disconnect(); for (const node of new Set(roleNames.map(key => surface?.[key]).filter(Boolean))) resize.observe(node);
        }
      }
      control.reconcile(surface);
      let anchor = activity;
      if (anchor?.isConnected) for (const slot of [...slots].reverse()) {
        if (slot.container.parentElement !== anchor.parentElement || slot.container.nextSibling !== anchor) anchor.before(slot.container);
        anchor = slot.container;
      }
      refreshGeometry();
      if (routeChanged) { transcripts.rebind(); shortcuts.rebind(); }
      else if (structuralSettings) shortcuts.refresh();
    } catch (error) {
      diagnostic = surfaceFailure = errorValue(error); if (diagnostic.code !== 'workspace_host_pending' && diagnostic.code !== 'ui_host_pending') report(error);
      surface = null; control.reconcile(null); features = { ...features, surface: false }; refreshGeometry();
    }
    structuralSettings = false; publish(routeChanged);
  }
  let structuralSettings = false;
  function schedule(scan = true) {
    if (!alive || !sessions.size) return;
    structural ||= scan;
    if (frame == null) {
      // Current UIKit can display a native window while its backing Chromium
      // document reports hidden. Its rAF/timers are throttled. Batch committed
      // events in a microtask there; visible web documents batch by frame.
      if (doc.visibilityState === 'hidden') {
        const token = --microtaskSequence; frame = token;
        queueMicrotask(() => { if (frame === token) reconcile(); });
      } else frame = requestFrame(reconcile);
    }
  }
  function observe() {
    if (observer) return;
    observer = new doc.defaultView.MutationObserver(records => {
      // Ignore consumer roots and changes below a stable native scroller. A new
      // direct body/footer child or a shell replacement still invalidates roles.
      const relevant = records.filter(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target?.closest(OWNED)) return false;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        if (nodes.length && nodes.every(node => node.nodeType === 1 && node.matches(OWNED))) return false;
        if (surface?.scroller?.contains(target) && target !== surface.scroller && ![...record.removedNodes].some(node => roleNames.some(key => node === surface[key] || node.contains?.(surface[key])))) return false;
        return true;
      });
      if (!relevant.length) return;
      structuralSettings = true; schedule(true);
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-app-shell-active-page'] });
    if (doc.defaultView.ResizeObserver) resize = new doc.defaultView.ResizeObserver(() => schedule(false));
    doc.defaultView.addEventListener('resize', onResize);
  }
  const onResize = () => schedule(false);
  function stopObserving() {
    observer?.disconnect(); resize?.disconnect(); observer = resize = null; unroute?.(); unroute = null;
    doc.defaultView.removeEventListener('resize', onResize);
    if (frame != null && frame >= 0) cancelFrame(frame); frame = null; host = root = surface = activity = null;
  }
  function issueTicket(args, invocation) {
    check();
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw workspaceError('invalid_argument', 'getApi expects an empty object');
    const caller = invocation?.caller;
    if (invocation?.signal?.aborted || !caller || typeof caller.pluginId !== 'string' || !Number.isSafeInteger(caller.generation)) throw workspaceError('invalid_owner', 'Workspace access requires a Core-authenticated caller');
    for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key);
    if (tickets.size >= 64) throw workspaceError('resource_limit', 'Too many pending workspace tickets');
    const ticket = crypto.randomUUID(); tickets.set(ticket, { ...caller, expires: Date.now() + 15000 });
    return { api: 1, symbol: WORKSPACE_SYMBOL, ticket };
  }
  function connect(owner, token) {
    check(); const ticket = tickets.get(token);
    if (!owner || owner.world !== 'main' || typeof owner.onDeactivate !== 'function' || typeof owner.pluginId !== 'string' || !Number.isSafeInteger(owner.generation)) throw workspaceError('invalid_owner', 'Workspace requires the live main-world consumer context');
    if (!ticket || ticket.expires < Date.now() || ticket.pluginId !== owner.pluginId || ticket.generation !== owner.generation) throw workspaceError('api_ticket_retired', 'Workspace ticket expired, was used or belongs to another owner');
    tickets.delete(token);
    if (sessions.size >= 64) throw workspaceError('resource_limit', 'Too many workspace sessions');
    const record = { listeners: new Set(), handles: new Map(), alive: true };
    const ownerKey = owner.pluginId + ':' + owner.generation; let release;
    const live = () => { check(); if (!record.alive) throw workspaceError('workspace_retired', 'Workspace consumer retired'); };
    function own(kind, limit, factory) {
      live(); const entries = record.handles.get(kind) ?? new Set(); record.handles.set(kind, entries);
      if (entries.size >= limit) throw workspaceError('resource_limit', `Too many owned ${kind} handles`);
      const value = factory();
      const result = Object.freeze({ ...value, dispose() { if (!entries.delete(result)) return; value.dispose(); } }); entries.add(result); return result;
    }
    const session = Object.freeze({ api: 1,
      getSnapshot() { live(); return snapshot; },
      subscribe(listener) { live(); if (typeof listener !== 'function' || record.listeners.size >= 32) throw workspaceError('invalid_argument', 'Expected a workspace listener (at most 32)'); record.listeners.add(listener); callback(listener, snapshot); return () => record.listeners.delete(listener); },
      getSurface() { live(); return publicSurface; },
      resolveThreadReference(element) { live(); return resolveThreadReference(doc, element, id => {
        try { return !!discovery.connection?.().manager.getConversation(id); } catch { return false; }
      }); },
      createSlot(name) {
        if (name !== 'activity.before') throw workspaceError('invalid_argument', 'Unknown workspace slot');
        return own('slot', 8, () => {
          if (!activity?.isConnected && !host?.auxiliary) try {
            activity = findActivity(doc); features = { ...features, activitySlot: !!activity };
          } catch (error) { diagnostic = errorValue(error); report(error); }
          const container = doc.createElement('span'); container.dataset.codletWorkspaceOwned = ownerKey;
          const slot = { container }; slots.add(slot); if (activity?.isConnected) activity.before(container); schedule(true);
          return { container, dispose() { slots.delete(slot); container.remove(); schedule(false); } };
        });
      },
      acquireSurface(options) { return own('surface', 8, () => {
        const lease = { options: surfaceOptions(options) }; control.leases.add(lease); control.reconcile(surface);
        let active = true;
        return { update(partial) { live(); if (!active) throw workspaceError('workspace_retired', 'Surface lease retired'); lease.options = surfaceOptions(partial, lease.options); control.reconcile(surface); },
          dispose() { active = false; control.leases.delete(lease); control.reconcile(surface); } };
      }); },
      mountTranscript(container, options) { return own('transcript', 16, () => { if (host?.auxiliary) throw workspaceError('workspace_transcript_unavailable', 'Auxiliary windows have no transcripts'); return transcripts.mount(container, options, ownerKey); }); },
      registerShortcut(options) { return own('shortcut', 16, () => { if (host?.auxiliary) throw workspaceError('workspace_shortcuts_unavailable', 'Auxiliary windows have no shortcut workspace'); schedule(true); return shortcuts.register(options, ownerKey); }); },
      dispose() {
        if (!record.alive) return; record.alive = false; record.listeners.clear();
        for (const entries of record.handles.values()) for (const handle of [...entries]) handle.dispose(); record.handles.clear(); sessions.delete(record); release?.();
        if (!sessions.size) stopObserving();
      },
    });
    record.session = session; sessions.add(record);
    try { release = owner.onDeactivate(session.dispose); if (!record.alive) throw workspaceError('workspace_retired', 'The consumer is already retired'); observe(); structural = true; reconcile(); }
    catch (error) { session.dispose(); throw error; }
    return session;
  }
  const publicApi = Object.freeze({ api: 1, connect });
  Object.defineProperty(globalThis, symbol, { value: publicApi, configurable: true });
  context.rpc.provide(WORKSPACE_CAPABILITY, 'getApi', issueTicket);
  function dispose() {
    if (!alive) return;
    for (const record of [...sessions]) record.session.dispose();
    alive = false; tickets.clear(); stopObserving(); control.dispose(); transcripts.dispose(); shortcuts.dispose(); discovery.dispose();
    if (globalThis[symbol] === publicApi) delete globalThis[symbol];
  }
  const releaseProvider = context.onDeactivate(dispose);
  return { issueTicket, connect, refresh: () => schedule(true), dispose() { dispose(); releaseProvider?.(); } };
}
