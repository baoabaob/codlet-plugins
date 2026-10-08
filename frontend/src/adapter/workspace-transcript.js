import { workspaceError, OWNED, providersFor, wrapProviders } from './workspace-dom.js';

export function transcriptOptions(options, previous = { hostId: 'local', readOnly: true, trackReadState: false }) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['threadId', 'hostId', 'readOnly', 'trackReadState', 'onState'].includes(key)))
    throw workspaceError('invalid_argument', 'Invalid transcript options');
  const result = { ...previous, ...options };
  if (!/^[\w-]{8,256}$/.test(result.threadId ?? '') || result.hostId !== 'local' ||
      typeof result.readOnly !== 'boolean' || typeof result.trackReadState !== 'boolean' || result.onState != null && typeof result.onState !== 'function')
    throw workspaceError('invalid_argument', 'Invalid local transcript identity or flags');
  return result;
}

export function createTranscripts({ document, load, surface, check, report }) {
  const records = new Set(), containers = new WeakSet(), histories = new Map(), queue = [], updates = new Set();
  let updateScheduled = false;
  let native, loading, unlisten, disposed = false, running = 0;
  const ensure = () => (loading ??= Promise.resolve().then(load).then(value => {
    if (disposed) throw workspaceError('workspace_retired', 'Transcript provider retired');
    native = value;
    return value;
  })).then(value => {
    if (disposed) throw workspaceError('workspace_retired', 'Transcript provider retired');
    if (records.size && !unlisten) unlisten = native.manager.addConversationStateCallback(threadId => {
      // Native owns its fine-grained render subscriptions. This shared listener
      // only projects loading readiness; it never rerenders on message deltas.
      for (const record of records) if (record.options.threadId === threadId && record.phase === 'loading') record.tryReady?.();
    });
    return value;
  });
  function pump() {
    if (disposed) return;
    queue.sort((a, b) => b.priority - a.priority);
    while (running < 2 && queue.length) {
      const job = queue.shift();
      if (![...records].some(record => !record.disposed && record.options.threadId === job.id)) { histories.delete(job.id); job.resolve(); continue; }
      running++;
      Promise.resolve().then(() => native.manager.getConversation(job.id)?.resumeState === 'resumed' ? undefined :
        native.manager.loadBackgroundThreadHistoryPage(job.id, { prioritize: job.priority > 0 })).then(job.resolve, job.reject).finally(() => {
        running--; if (histories.get(job.id) === job.promise) histories.delete(job.id); pump();
      });
    }
  }
  function history(record) {
    const id = record.options.threadId;
    if (histories.has(id)) return histories.get(id);
    const job = { id, priority: !record.options.readOnly ? 2 : record.container.getBoundingClientRect().height > 0 ? 1 : 0 };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    histories.set(id, job.promise); queue.push(job); pump(); return job.promise;
  }
  function state(record, phase, error) {
    if (record.disposed && phase !== 'disposed') return;
    if (record.phase === phase && !error) return;
    record.phase = phase;
    const value = Object.freeze({ phase, threadId: record.options.threadId, hostId: 'local', diagnostic: error ? Object.freeze({ code: error.code ?? 'workspace_transcript_unavailable', message: error.message }) : null });
    try { Promise.resolve(record.options.onState?.(value)).catch(report); } catch (error) { report(error); }
  }
  function mount(container, options, owned) {
    check();
    if (records.size >= 32) throw workspaceError('resource_limit', 'At most 32 native transcripts per Target are supported');
    if (!(container instanceof document.defaultView.HTMLElement) || container.ownerDocument !== document || !container.isConnected || container.childNodes.length || containers.has(container) ||
        container.matches('main,[data-codex-composer-root],.thread-scroll-container') || container.closest('[data-codex-composer-root]'))
      throw workspaceError('invalid_argument', 'Transcript requires a connected empty consumer container');
    const record = { container, options: transcriptOptions(options), disposed: false, epoch: 0, phase: null, root: null };
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    // Consumers still receive the rejecting ready promise, while provider
    // retirement before a consumer attaches a catch creates no unhandled error.
    ready.catch(() => {});
    const wrapper = document.createElement('div'); wrapper.dataset.codletWorkspaceOwned = owned;
    wrapper.style.cssText = 'display:flex;flex-direction:column;min-width:0;min-height:0;width:100%;height:100%;overflow:hidden;position:relative;';
    container.append(wrapper); record.wrapper = wrapper; records.add(record); containers.add(container);
    let scroll, settled = false, readyObserver;
    const fail = error => { if (record.disposed) return; state(record, 'error', error); report(error); if (!settled) { settled = true; rejectReady(error); } };
    function tryReady() {
      if (record.disposed || !record.committed || record.bindingThread !== record.options.threadId || record.phase !== 'loading') return;
      const scroller = wrapper.querySelector('.thread-scroll-container');
      if (!scroller) { fail(workspaceError('workspace_transcript_unavailable', 'The native transcript has no independent scroller')); return; }
      const conversation = native.manager.getConversation(record.options.threadId);
      if (conversation?.resumeState !== 'resumed') return;
      const body = scroller.querySelector('[data-thread-find-target="conversation"]');
      const hasHistory = !!conversation.turns?.length || conversation.turnHistory?.kind === 'canonical' && conversation.turnHistory.history?.islands?.some(island => island.entries?.length);
      if (!body || hasHistory && !body.textContent.trim()) return;
      scroll = scroller; readyObserver?.disconnect(); state(record, 'ready');
      if (!settled) { settled = true; resolveReady(); }
    }
    record.tryReady = tryReady;
    function render(sync = false) {
      if (record.disposed || !record.root || record.bindingThread !== record.options.threadId) return;
      const N = native, R = N.React, h = R.createElement, opts = record.options;
      const child = h(record.Boundary, { key: opts.threadId }, h(R.Suspense, { fallback: null },
        h(N.Scope, { scope: N.composerScope, value: record.scopeValue },
          h(N.ThreadSubscription, { threadKey: record.threadKey }),
          h(N.Content, { conversationId: opts.threadId, hostId: 'local', contentSearchOrchestrationId: 'codlet:' + owned + ':' + opts.threadId,
            isReadOnly: opts.readOnly, trackReadState: opts.trackReadState, retainActiveInterest: true }), h(record.Commit, { epoch: record.epoch }))));
      if (opts.readOnly) wrapper.setAttribute('inert', ''); else wrapper.removeAttribute('inert');
      const tree = wrapProviders(N, record.providers, child);
      if (sync) N.DOM.flushSync(() => record.root.render(tree)); else record.root.render(tree);
    }
    record.render = render;
    function scheduleUpdate() {
      updates.add(record);
      if (updateScheduled) return;
      updateScheduled = true; queueMicrotask(() => {
        updateScheduled = false;
        const pending = [...updates]; updates.clear();
        for (const entry of pending) if (!entry.disposed) try { entry.render(); } catch (error) { report(error); }
      });
    }
    async function bind(reload = true) {
      const epoch = ++record.epoch; state(record, 'loading');
      record.committed = false; scroll = null;
      try {
        const N = await ensure();
        if (record.disposed || epoch !== record.epoch) return;
        if (reload) await history(record);
        if (record.disposed || epoch !== record.epoch) return;
        check();
        const source = surface()?.content ?? surface()?.main;
        if (!source?.isConnected) throw workspaceError('workspace_host_pending', 'Open a main workspace before mounting a transcript');
        const providers = providersFor(source);
        if (!providers.length) throw workspaceError('workspace_transcript_unavailable', 'Native transcript providers are unavailable');
        const R = N.React, h = R.createElement;
        if (!record.root) {
          record.root = N.Client.createRoot(wrapper, { onUncaughtError: fail, onCaughtError: fail });
          record.Boundary = class extends R.Component {
            constructor(props) { super(props); this.state = { failed: false }; }
            static getDerivedStateFromError() { return { failed: true }; }
            componentDidCatch(error) { fail(error); }
            render() { return this.state.failed ? null : this.props.children; }
          };
          record.Commit = function Commit({ epoch }) {
            R.useLayoutEffect(() => {
              if (epoch !== record.epoch) return;
              wrapper.dataset.codletWorkspaceCommit = String((record.commits ?? 0) + 1); record.commits = (record.commits ?? 0) + 1;
              record.committed = true; tryReady();
            });
            return null;
          };
        }
        const opts = record.options;
        record.providers = providers;
        if (record.bindingThread !== opts.threadId) {
          record.scopeValue = N.composerValue({ routeKind: 'local-thread', conversationId: opts.threadId, pathname: '/local/' + opts.threadId, hostId: 'local' }, undefined, opts.threadId);
          record.threadKey = { hostId: 'local', threadId: opts.threadId };
        }
        record.bindingThread = opts.threadId;
        readyObserver ??= new document.defaultView.MutationObserver(tryReady);
        readyObserver.observe(wrapper, { childList: true, subtree: true, characterData: true });
        render(true);
      } catch (error) { if (!record.disposed && epoch === record.epoch) fail(error); }
    }
    const handle = Object.freeze({ ready,
      update(partial) {
        check(); if (record.disposed) throw workspaceError('workspace_retired', 'Transcript retired');
        const next = transcriptOptions(partial, record.options), previous = record.options; record.options = next;
        if (next.threadId !== previous.threadId) void bind();
        else if (next.readOnly !== previous.readOnly || next.trackReadState !== previous.trackReadState) {
          // Keep the ready phase, captured providers, scope value, subscription
          // and scroll node. Coalesce all owners' flag changes in one microtask;
          // let Native React schedule commits instead of serial flushSync calls.
          if (next.readOnly) wrapper.setAttribute('inert', ''); else wrapper.removeAttribute('inert');
          scheduleUpdate();
        }
      },
      getScrollPosition() { check(); if (record.disposed) throw workspaceError('workspace_retired', 'Transcript retired'); if (!scroll) throw workspaceError('workspace_host_pending', 'Transcript scroller is not ready'); return { top: scroll.scrollTop, left: scroll.scrollLeft }; },
      setScrollPosition(value) {
        check(); if (record.disposed) throw workspaceError('workspace_retired', 'Transcript retired');
        if (!value || Object.keys(value).some(key => !['top', 'left'].includes(key)) || !['top', 'left'].every(key => Number.isFinite(value[key]))) throw workspaceError('invalid_argument', 'Invalid transcript scroll position');
        if (!scroll) throw workspaceError('workspace_host_pending', 'Transcript scroller is not ready'); scroll.scrollTop = value.top; scroll.scrollLeft = value.left;
      },
      dispose() {
        if (record.disposed) return;
        record.disposed = true; record.epoch++; readyObserver?.disconnect(); updates.delete(record); state(record, 'disposed'); records.delete(record); containers.delete(container);
        if (!settled) { settled = true; rejectReady(workspaceError('workspace_retired', 'Transcript retired before readiness')); }
        if (record.root) native.DOM.flushSync(() => record.root.unmount()); wrapper.remove(); scroll = null;
        if (!records.size) { unlisten?.(); unlisten = null; }
      },
    });
    record.handle = handle; record.rebind = () => void bind(false); void bind(); return handle;
  }
  return { mount, rebind() { for (const record of records) record.rebind(); }, dispose() {
    if (disposed) return; disposed = true;
    for (const record of [...records]) record.handle.dispose(); unlisten?.();
    for (const job of queue.splice(0)) job.reject(workspaceError('workspace_retired', 'Queued history retired')); histories.clear(); updates.clear();
  } };
}
