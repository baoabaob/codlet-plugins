import { componentSource, currentElementAncestry } from '../host-discovery.js';
import { wrapProviders, workspaceError } from './workspace-dom.js';

const hasMarkers = (fiber, markers) => markers.every(marker => componentSource(fiber.type).includes(marker));
const unsupported = () => workspaceError('workspace_composer_unsupported', 'Native draft handoff and release must be supplied by a reviewed profile');

export function inspectNativeComposerScope(native, chain) {
  // EditorProvider also mentions these props. Require the closest component
  // that actually owns a Native composer facade, rather than the first text
  // match; otherwise a valid current Native editor can never become ready.
  for (const implementation of chain) {
    if (!hasMarkers(implementation, ['onDocumentChange', 'onDocumentDispose', 'composerController'])) continue;
    let model;
    for (let hook = implementation.memoizedState, count = 0; hook && count++ < 128; hook = hook.next) {
      const candidate = hook.memoizedState?.current;
      if (candidate?.scope !== native.composerScope || !candidate.node) continue;
      if (model && model.node !== candidate.node) throw workspaceError('workspace_composer_binding_drift', 'Native composer model is ambiguous');
      model = candidate;
    }
    if (model) return model;
  }
  return null;
}

// Read the committed Native editor/model, not the props of our own boundary.
// The handler is observed through Native's registerSubmitHandler path; it is
// never invoked as a test. Neither the facade nor controller leaves the driver.
export function inspectNativeComposer(native, container, scopes, register, identity) {
  const inputs = container.querySelectorAll('[data-codex-composer-root]');
  if (!inputs.length) return null;
  if (inputs.length !== 1) throw workspaceError('workspace_composer_binding_drift', 'Native input is ambiguous');
  const input = inputs[0], editable = input.querySelector('[contenteditable="true"]');
  if (!editable) return null;
  // ProseMirror inserts its DOM outside React. Start at its nearest committed
  // React host; do not follow a stale return chain or another root.
  let chain;
  for (let node = editable, depth = 0; node && container.contains(node) && depth < 16; node = node.parentElement, depth++) {
    chain = currentElementAncestry(node, container);
    if (chain) break;
  }
  if (!chain) return null;
  const model = inspectNativeComposerScope(native, chain);
  if (!model || !scopes?.composer) return null;
  if (scopes.composer.scope !== native.composerScope || scopes.thread?.scope !== native.ThreadScope || scopes.route?.scope !== native.RouteScope ||
      model.node !== scopes.composer.node || model.value?.kind !== 'local' || model.value.conversationId !== identity.threadId ||
      model.value.clientThreadId !== scopes.thread?.value?.clientThreadId || scopes.route?.value?.conversationId !== identity.threadId)
    throw workspaceError('workspace_composer_binding_drift', 'Native editor scope does not match the requested conversation');
  const controllers = new Set();
  for (const fiber of chain) {
    const value = fiber.tag === 10 && fiber.memoizedProps?.value;
    if (value?.view?.dom === editable) controllers.add(value);
    for (let dep = fiber.dependencies?.firstContext, count = 0; dep && count++ < 128; dep = dep.next)
      if (dep.memoizedValue?.view?.dom === editable) controllers.add(dep.memoizedValue);
  }
  if (!controllers.size) return null;
  if (controllers.size !== 1) throw workspaceError('workspace_composer_binding_drift', 'Native editor controller is ambiguous');
  const controller = [...controllers][0];
  if (controller.view.isDestroyed || typeof controller.getPersistedText !== 'function' || typeof controller.restoreDraft !== 'function')
    throw workspaceError('workspace_composer_binding_drift', 'Native editor controller changed');
  const submission = chain.find(fiber => fiber.memoizedProps?.registerSubmitHandler === register &&
    typeof fiber.memoizedProps?.onSubmitLocal === 'function' && typeof fiber.memoizedProps?.submitDisabled === 'boolean');
  if (!submission) return null;
  return { input, editable, controller, scope: model, scopes,
    submitDisabled: submission.memoizedProps.submitDisabled === true };
}

// Actual direct-composer rendering path. It has no thread Frame, viewport
// sizer, route navigation or owner-level selection policy. Native lifecycle
// glue is mandatory; discovering components alone never enables this driver.
export function createNativeComposerDriver({ native, document, container, providers, owner, check, metrics }) {
  const lifecycle = native.composerLifecycle;
  for (const method of ['prepare', 'createController', 'checkpoint', 'acquire', 'released']) if (typeof lifecycle?.[method] !== 'function') throw unsupported();
  if (typeof native.useScope !== 'function' || !native.Composer || !native.ComposerSurface) throw unsupported();
  const R = native.React, h = R.createElement, viewId = metrics?.nextView(), namespace = owner + ':' + crypto.randomUUID();
  const records = new Set();
  let root, current, pending, epoch = 0, retired = false, blocked = true, closing, queue = Promise.resolve();
  function block() {
    blocked = true; container.setAttribute('inert', '');
    if (container.contains(document.activeElement)) document.activeElement.blur?.();
  }
  const valid = (record, signal) => {
    check(); native.check?.(); signal?.throwIfAborted();
    if (retired || record.epoch !== epoch) throw workspaceError('workspace_composer_superseded', 'Native composer operation was replaced');
  };
  function stopPending(error) {
    const wait = pending; if (!wait) return;
    pending = null; wait.observer.disconnect(); wait.signal.removeEventListener('abort', wait.abort);
    error ? wait.reject(error) : wait.resolve();
  }
  function read() {
    if (!current || !current.scopes || !current.submit || retired) return null;
    const value = inspectNativeComposer(native, container, current.scopes, current.register, current.identity);
    if (value && value.controller !== current.controller) throw workspaceError('workspace_composer_binding_drift', 'Native rendered another editor controller');
    return value;
  }
  function pulse() {
    if (!pending) return;
    try {
      valid(current, pending.signal);
      const value = read();
      if (!value || pending.enabled && value.submitDisabled) return;
      current.model = value; blocked = !pending.enabled; stopPending();
    } catch (error) { block(); stopPending(error); }
  }
  function Capture({ record, enabled }) {
    const [, refresh] = R.useState(0);
    const thread = native.useScope(native.ThreadScope), route = native.useScope(native.RouteScope), composer = native.useScope(native.composerScope);
    R.useLayoutEffect(() => () => { record.detached = true; }, []);
    R.useLayoutEffect(() => {
      if (retired || record.signal?.aborted || current !== record || record.epoch !== epoch) return;
      record.scopes = { thread, route, composer };
      if (!record.controller) {
        // Native's EditorProvider accepts an external Native controller. Its
        // internal onDocumentDispose/delayed destroy branch is skipped for it;
        // the reviewed lifecycle owns checkpoint + destroy for this instance.
        try {
          const controller = lifecycle.createController({ identity: record.identity, scopes: record.scopes });
          record.controller = controller; records.add(record);
          if (!controller?.view || typeof controller.getPersistedText !== 'function' || typeof controller.restoreDraft !== 'function' || typeof controller.destroy !== 'function') throw unsupported();
          refresh(value => value + 1);
        } catch (error) { block(); stopPending(error); }
        return;
      }
      pulse();
    });
    if (!record.controller || retired || record.signal?.aborted || record.epoch !== epoch) return null;
    return h(native.ComposerSurface, { placement: { kind: 'thread' } }, h(native.Composer, {
      disableAutoFocus: true, submitDisabled: !enabled, composerController: record.controller,
      registerSubmitHandler: record.register,
    }));
  }
  class Boundary extends R.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error) { block(); stopPending(error); }
    render() { return this.state.error ? null : this.props.children; }
  }
  function render(record, enabled, signal) {
    valid(record, signal);
    record.signal = signal;
    stopPending(workspaceError('workspace_composer_superseded', 'Native commit was replaced'));
    if (!root) { root = native.Client.createRoot(container, { onUncaughtError: error => { block(); stopPending(error); } }); metrics?.add('composer.native.root.create', { viewId }); }
    return new Promise((resolve, reject) => {
      const abort = () => { block(); stopPending(signal.reason ?? workspaceError('invocation_cancelled', 'Native commit was cancelled')); };
      const observer = new document.defaultView.MutationObserver(pulse);
      pending = { resolve, reject, signal, abort, observer, enabled };
      signal.addEventListener('abort', abort, { once: true });
      observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable', 'disabled'] });
      const threadValue = { clientThreadId: record.composerValue.clientThreadId };
      root.render(wrapProviders(native, providers, h(Boundary, { key: record.identity.threadId + ':' + record.identity.bindingRevision }, h(R.Suspense, { fallback: null },
        h(native.Scope, { scope: native.ThreadScope, value: threadValue },
          h(native.Scope, { scope: native.RouteScope, value: record.route },
            h(native.Scope, { scope: native.composerScope, value: record.composerValue }, h(Capture, { record, enabled }))))))));
      metrics?.add('composer.native.render', { viewId, threadAlias: record.identity.bindingRevision });
    });
  }
  function serial(work) {
    const next = queue.then(work); queue = next.catch(() => {}); return next;
  }
  function checkpoint(record, signal) {
    if (!record || !root) return Promise.resolve();
    const model = inspectNativeComposer(native, container, record.scopes, record.register, record.identity);
    if (!model) throw workspaceError('workspace_composer_binding_drift', 'Native draft model is unavailable for handoff');
    record.model = model;
    return lifecycle.checkpoint({ identity: record.identity, model }, { signal });
  }
  async function release(record, options) {
    if (!record) { await lifecycle.released({}, options); return; }
    try { await lifecycle.released({ identity: record.identity, model: record.model, controller: record.controller }, options); }
    finally {
      try { if (record.controller && !record.controller.view?.isDestroyed && typeof record.controller.destroy === 'function') record.controller.destroy(); }
      finally { records.delete(record); }
    }
  }
  block();
  return {
    block,
    isComposing() { return read()?.controller.view.composing === true; },
    readBinding() {
      const model = read(); if (!model) return null;
      return { ...current.identity, inputConfirmed: true, submitDisabled: blocked || model.submitDisabled };
    },
    focus() { const model = read(); if (blocked || !model) return false; model.editable.focus({ preventScroll: true }); return document.activeElement === model.editable; },
    bind(identity, { signal }) {
      block(); const accepted = ++epoch; stopPending(workspaceError('workspace_composer_superseded', 'Native binding was replaced'));
      return serial(async () => {
        signal.throwIfAborted(); if (retired || accepted !== epoch) throw workspaceError('workspace_composer_superseded', 'Native binding was replaced');
        await lifecycle.prepare(identity, { signal });
        signal.throwIfAborted(); check(); if (retired || accepted !== epoch) throw workspaceError('workspace_composer_superseded', 'Native preparation was replaced');
        const previous = current;
        await checkpoint(previous, signal);
        signal.throwIfAborted(); check(); if (retired || accepted !== epoch) throw workspaceError('workspace_composer_superseded', 'Native checkpoint was replaced');
        const route = native.routeDescription({ pathname: '/local/' + identity.threadId, search: '?codletComposer=' + encodeURIComponent(namespace) });
        const composerValue = native.composerValue(route);
        if (route?.routeKind !== 'local-thread' || route.conversationId !== identity.threadId || composerValue?.kind !== 'local' || composerValue.conversationId !== identity.threadId)
          throw workspaceError('workspace_composer_binding_drift', 'Native rejected the input identity');
        const record = { identity: Object.freeze({ ...identity }), epoch: accepted, route, composerValue };
        record.register = submit => { if (!retired && current === record && epoch === record.epoch) { record.submit = typeof submit === 'function' ? submit : null; pulse(); } };
        current = record;
        try { await render(record, false, signal); }
        finally { if (previous?.controller && previous.detached) await release(previous, { signal, reason: 'rebind' }); }
      });
    },
    activate({ bindingRevision, signal }) {
      const record = current; if (!record || record.identity.bindingRevision !== bindingRevision) throw workspaceError('workspace_composer_superseded', 'Native binding was replaced');
      block();
      return serial(async () => {
        valid(record, signal); await lifecycle.acquire(record.identity, { signal }); valid(record, signal);
        await render(record, true, signal); valid(record, signal);
      });
    },
    close({ signal }) {
      if (closing) return closing;
      block(); retired = true; epoch++; stopPending(workspaceError('workspace_retired', 'Native input retired'));
      const record = current;
      closing = serial(async () => {
        // A profile must preserve its Native document/attachments before the
        // keyed editor's dispose callback runs. A failed checkpoint is explicit;
        // it cannot become a success merely because the DOM is gone.
        let failure;
        try { await checkpoint(record, signal); } catch (error) { failure = error; }
        try { root?.unmount(); if (root) metrics?.add('composer.native.root.dispose', { viewId }); }
        catch (error) { failure ??= error; }
        root = null; current = null;
        for (const entry of [...records]) {
          try { await release(entry, { signal, failure, reason: 'close' }); }
          catch (error) { failure ??= error; }
        }
        if (!record?.controller) {
          try { await lifecycle.released({ identity: record?.identity }, { signal, failure, reason: 'close' }); }
          catch (error) { failure ??= error; }
        }
        if (failure) throw failure;
        signal.throwIfAborted();
      });
      return closing;
    },
  };
}
