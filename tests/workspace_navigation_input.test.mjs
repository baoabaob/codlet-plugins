import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createWorkspaceNavigation } from '../frontend/src/adapter/workspace-navigation.js';

const require = createRequire(new URL('../frontend/package.json', import.meta.url)), { JSDOM } = require('jsdom');
function setup(t, { cold = false, inputApi = 1 } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"><div data-codex-composer-root><div id="input" tabindex="0" contenteditable="true"></div></div></div>', { url: 'app://-/index.html' });
  const { window } = dom, { document } = window, editable = document.getElementById('input');
  const makeBinding = threadId => ({ threadId, hostId: 'local', clientThreadId: 'local:' + threadId,
    input: editable.parentElement, editable, controller: { view: { dom: editable, composing: false } }, submitHandler() {}, submitDisabled: false,
    scopeNode: {}, scopeValue: {}, threadNode: {}, threadValue: {}, routeNode: {}, routeValue: {} });
  const state = { binding: makeBinding('fixture-a'), alive: true }, calls = [], requests = [], checkedInputs = [];
  const navigator = { location: { pathname: '/local/fixture-a', search: '', hash: '', state: null }, push(path) {
    calls.push(path); this.location = { ...this.location, pathname: path }; state.binding = makeBinding(path.slice(7));
  } };
  const manager = { getConversation: id => cold && id !== 'fixture-a' ? null : { id, hostId: 'local', resumeState: 'resumed' },
    sendRequest(method, args) { return new Promise(resolve => requests.push({ method, args, resolve })); } };
  const provider = createWorkspaceNavigation({ document, load: async () => ({ manager, inputApi }), host: () => ({ navigator }),
    check() { if (!state.alive) throw Object.assign(Error('retired'), { code: 'workspace_retired' }); }, changed() {},
    readBinding: checked => { if (checked !== undefined) checkedInputs.push(checked); return state.binding; }, readCurrentInput: () => state.binding });
  const navigation = provider.create(() => {});
  t.after(() => { provider.dispose(); window.close(); });
  return { window, document, editable, state, calls, requests, navigator, provider, navigation, makeBinding, checkedInputs };
}

test('strict navigation keeps Native objects private and explicit focus checks revision, route and the complete input pin', async t => {
  const f = setup(t); assert.equal(f.navigation.inputApi, 0); assert.equal(await f.navigation.ready, undefined); assert.equal(f.navigation.inputApi, 1);
  const before = f.document.activeElement, priorInput = f.state.binding, first = f.navigation.open({ threadId: 'fixture-b' });
  assert.deepEqual(f.checkedInputs, [priorInput], 'binding reuses the same synchronous IME-preflight inspection');
  const commit = await first.committed; assert.equal(f.document.activeElement, before, 'open never explicitly focuses');
  assert.equal(f.navigation.focus({ revision: commit.revision }), true);
  assert.equal(f.navigation.focus({ revision: commit.revision + 1 }), false);
  for (const field of ['controller', 'scopeNode', 'scopeValue', 'threadNode', 'routeNode', 'submitHandler']) {
    const old = f.state.binding[field]; f.state.binding = { ...f.state.binding, [field]: field === 'controller' ? { view: { dom: f.editable, composing: false } } : {} };
    assert.equal(f.navigation.focus({ revision: commit.revision }), false, field + ' changed with the same DOM/thread ID');
    f.state.binding = { ...f.state.binding, [field]: old };
  }
  f.navigator.location.search = '?changed'; assert.equal(f.navigation.focus({ revision: commit.revision }), false);
  f.navigator.location.search = ''; f.editable.parentElement.setAttribute('inert', ''); assert.equal(f.navigation.focus({ revision: commit.revision }), false);
  f.editable.parentElement.removeAttribute('inert'); first.dispose();
  assert.equal(f.navigation.focus({ revision: commit.revision }), false, 'retiring the operation invalidates its focus pin');
  f.navigation.dispose();
  assert.throws(() => f.navigation.focus({ revision: commit.revision }), { code: 'workspace_retired' });
});

test('busy open synchronously preserves composition, focus, routing and the previous pending operation', async t => {
  const f = setup(t, { cold: true }); await f.navigation.ready; f.editable.focus();
  const old = f.navigation.open({ threadId: 'fixture-cold' }); let settled = false;
  old.executed.then(() => settled = true, () => settled = true);
  f.state.binding.controller.view.composing = true;
  assert.throws(() => f.navigation.open({ threadId: 'fixture-new' }), { code: 'workspace_composer_busy' });
  await Promise.resolve(); assert.equal(settled, false); assert.equal(f.document.activeElement, f.editable); assert.deepEqual(f.calls, []);
  f.state.binding.controller.view.composing = false; f.requests[0].resolve({ thread: { id: 'fixture-cold' } });
  await old.committed; assert.deepEqual(f.calls, ['/local/fixture-cold']);
});

test('a composition beginning during cold metadata validation rejects immediately before Native navigation', async t => {
  const f = setup(t, { cold: true }); await f.navigation.ready;
  const op = f.navigation.open({ threadId: 'fixture-cold' }); f.state.binding.controller.view.composing = true;
  f.requests[0].resolve({ thread: { id: 'fixture-cold' } });
  await assert.rejects(op.executed, { code: 'workspace_composer_busy' }); await assert.rejects(op.committed, { code: 'workspace_composer_busy' });
  assert.deepEqual(f.calls, []); assert.equal(f.navigator.location.pathname, '/local/fixture-a');
});

test('capture-phase composition state guards nested editor input even before the Native controller flag updates', async t => {
  const f = setup(t); await f.navigation.ready;
  f.editable.dispatchEvent(new f.window.CompositionEvent('compositionstart', { bubbles: true, data: 'synthetic' }));
  assert.equal(f.state.binding.controller.view.composing, false);
  assert.throws(() => f.navigation.open({ threadId: 'fixture-b' }), { code: 'workspace_composer_busy' }); assert.deepEqual(f.calls, []);
  f.editable.dispatchEvent(new f.window.CompositionEvent('compositionend', { bubbles: true }));
  await f.navigation.open({ threadId: 'fixture-b' }).committed;
});

test('already-selected confirmation rejects a same-ID controller replacement and rapid supersession retires old focus revisions', async t => {
  const f = setup(t); await f.navigation.ready;
  const same = f.navigation.open({ threadId: 'fixture-a' }); await same.executed;
  f.state.binding = { ...f.state.binding, controller: { view: { dom: f.editable, composing: false } } };
  await assert.rejects(same.committed, { code: 'workspace_composer_binding_drift' }); assert.deepEqual(f.calls, []);
  // A transient old input can already show A while the route is moving to B.
  // Returning to A is a real route change and may create a fresh A controller.
  f.navigator.location.pathname = '/local/fixture-b';
  const returning = f.navigation.open({ threadId: 'fixture-a' });
  assert.equal((await returning.committed).inputConfirmed, true);
  const next = f.navigation.open({ threadId: 'fixture-b' }); const commit = await next.committed;
  const newer = f.navigation.open({ threadId: 'fixture-c' }); assert.equal(f.navigation.focus({ revision: commit.revision }), false);
  await newer.committed;
});

test('an older navigation provider never claims the strict focus/IME contract', async t => {
  const f = setup(t, { inputApi: 0 }); await f.navigation.ready; assert.equal(f.navigation.inputApi, 0);
  assert.throws(() => f.navigation.focus({ revision: 1 }), { code: 'workspace_navigation_unsupported' });
});
