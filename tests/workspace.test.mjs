import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { createLoadedThreads } from '../frontend/src/desktop/loaded-threads.js';
import { keymapExport, assetReferences } from '../frontend/src/adapter/workspace-discovery.js';
import { componentSource } from '../frontend/src/host-discovery.js';
const require = createRequire(new URL('../frontend/package.json', import.meta.url)), { JSDOM } = require('jsdom');
const source = (await build({ entryPoints: [new URL('../frontend/src/adapter/workspace.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true, write: false, format: 'iife', globalName: 'Workspace', platform: 'browser' })).outputFiles[0].text;
const domSource = (await build({ entryPoints: [new URL('../frontend/src/adapter/workspace-dom.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true, write: false, format: 'iife', globalName: 'WorkspaceDom', platform: 'browser' })).outputFiles[0].text;
const nativeSource = (await build({ absWorkingDir: fileURLToPath(new URL('../frontend', import.meta.url)), stdin: { contents: readFileSync(new URL('./support/native-shell.js', import.meta.url), 'utf8'), resolveDir: fileURLToPath(new URL('../frontend', import.meta.url)) }, bundle: true, write: false, format: 'iife', globalName: 'NativeShell', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(t) {
  const dom = new JSDOM('<!doctype html><body><div id="root"><nav><button id="activity"></button><span data-thread-title id="thread"></span></nav><div data-app-shell-main-titlebar></div><main data-app-shell-main-surface><div data-includes-composer><div class="thread-scroll-container"><section id="body">body</section><footer data-thread-scroll-footer><div data-codex-composer-root></div></footer></div></div></main><aside data-app-shell-focus-area="right-panel"></aside></div></body>', { url: 'app://-/index.html', runScripts: 'outside-only' });
  const { window } = dom, { document } = window; window.eval(source); window.eval(domSource);
  const activity = document.getElementById('activity');
  activity.__reactFiber$fixture = { memoizedProps: {}, type: function activityOwner({ onActivate, needsAttention }) { return 'sidebarElectron.priorityThreads.coachmark.description'; } };
  const frames = new Map(), diagnostics = [], cleanups = new Set(), rpc = new Map(); let frameCount = 0, discoveryCount = 0;
  const context = { onDeactivate(fn) { cleanups.add(fn); return () => cleanups.delete(fn); }, reportDiagnostic(error) { diagnostics.push(error); }, rpc: { provide(cap, method, handler) { rpc.set(cap.name + ':' + method, handler); } } };
  const navigator = { location: { pathname: '/local/thread-a', search: '', hash: '' } }, host = { navigator, rootNode: document.getElementById('root') };
  const discovery = { transcript() { throw Error('Not loaded'); }, shortcuts() { throw Error('Not loaded'); }, dispose() {} };
  const workspace = window.Workspace.createWorkspace(context, { document, validateDocument() {}, locate: () => { discoveryCount++; return host; }, discovery, requestFrame(fn) { frames.set(++frameCount, fn); return frameCount; }, cancelFrame(id) { frames.delete(id); } });
  t.after(() => { workspace.dispose(); window.close(); });
  function owner(id, generation = 1) { const cleanups = new Set(); return { world: 'main', pluginId: id, generation, onDeactivate(fn) { cleanups.add(fn); return () => cleanups.delete(fn); }, retire() { for (const fn of [...cleanups]) fn(); } }; }
  const connect = (id = 'consumer', generation = 1) => { const ctx = owner(id, generation), descriptor = workspace.issueTicket({}, { caller: ctx }); return { ctx, session: workspace.connect(ctx, descriptor.ticket), descriptor }; };
  async function flush() { await tick(); const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); await tick(); }
  return { window, document, workspace, discovery, rpc, connect, owner, flush, frames, navigator, diagnostics, stats: () => ({ frameCount, discoveryCount }) };
}

test('workspace tickets bind owner/generation, are single-use, and deactivation retires all owned handles', async t => {
  const f = fixture(t), ctx = f.owner('alice'), descriptor = f.workspace.issueTicket({}, { caller: ctx });
  assert.deepEqual(Object.keys(descriptor).sort(), ['api', 'symbol', 'ticket']);
  assert.throws(() => f.workspace.connect(f.owner('bob'), descriptor.ticket), { code: 'api_ticket_retired' });
  assert.throws(() => f.workspace.connect(f.owner('alice', 2), descriptor.ticket), { code: 'api_ticket_retired' });
  const session = f.workspace.connect(ctx, descriptor.ticket);
  assert.throws(() => f.workspace.connect(ctx, descriptor.ticket), { code: 'api_ticket_retired' });
  const slot = session.createSlot('activity.before'); await f.flush(); assert.equal(slot.container.nextElementSibling.id, 'activity');
  let updates = 0; session.subscribe(() => updates++); assert.equal(updates, 1);
  ctx.retire(); assert.equal(slot.container.isConnected, false); assert.equal(f.frames.size, 0);
  assert.throws(() => session.getSnapshot(), { code: 'workspace_retired' });
});

test('surface leases compose, rebind after navigation and precisely restore attributes/priorities without clobbering a newer patch', async t => {
  const f = fixture(t), a = f.connect('a').session, b = f.connect('b').session, body = f.document.getElementById('body');
  body.style.setProperty('visibility', 'collapse', 'important'); body.setAttribute('aria-hidden', 'false');
  const first = a.acquireSurface({ hideBody: true, composerEnabled: false }), second = b.acquireSurface({ hideBody: true });
  assert.equal(body.style.visibility, 'hidden'); assert.equal(body.hasAttribute('inert'), true);
  first.dispose(); assert.equal(body.style.visibility, 'hidden'); second.dispose();
  assert.equal(body.style.visibility, 'collapse'); assert.equal(body.style.getPropertyPriority('visibility'), 'important'); assert.equal(body.getAttribute('aria-hidden'), 'false'); assert.equal(body.hasAttribute('inert'), false);
  const lease = a.acquireSurface({ hideBody: true, hideHeader: true });
  const replacement = body.cloneNode(true); replacement.removeAttribute('style'); replacement.removeAttribute('inert'); replacement.removeAttribute('aria-hidden'); body.replaceWith(replacement); f.navigator.location.pathname = '/local/thread-b'; await f.flush();
  assert.equal(body.style.visibility, 'collapse'); assert.equal(replacement.style.visibility, 'hidden');
  replacement.style.visibility = 'visible'; lease.dispose(); assert.equal(replacement.style.visibility, 'visible'); assert.equal(replacement.hasAttribute('inert'), false);
  assert.equal(a.getSnapshot().threadId, 'thread-b');
});

test('streamed body tokens and owned slots do not schedule full discovery; burst shell changes coalesce to one frame', async t => {
  const f = fixture(t), session = f.connect().session, slot = session.createSlot('activity.before'); await f.flush();
  const before = f.stats();
  for (let i = 0; i < 100; i++) f.document.getElementById('body').append(f.document.createElement('span'));
  for (let i = 0; i < 100; i++) slot.container.append(f.document.createElement('button'));
  await f.flush(); assert.deepEqual(f.stats(), before);
  for (let i = 0; i < 40; i++) f.document.querySelector('nav').append(f.document.createElement('span'));
  await f.flush(); assert.equal(f.stats().frameCount, before.frameCount + 1); assert.equal(f.stats().discoveryCount, 1);
  await f.flush(); assert.equal(f.frames.size, 0);
});

test('native thread references are bounded, reject remote/consumer/main nodes, and surface ambiguity fails closed', async t => {
  const f = fixture(t), session = f.connect().session, row = f.document.getElementById('thread');
  row.__reactFiber$fixture = { memoizedProps: { threadKey: { threadId: 'thread-a', hostId: 'local' } } };
  assert.deepEqual(plain(session.resolveThreadReference(row)), { threadId: 'thread-a', hostId: 'local' });
  row.__reactFiber$fixture.memoizedProps.threadKey.hostId = 'remote'; assert.equal(session.resolveThreadReference(row), null);
  row.__reactFiber$fixture.memoizedProps.threadKey.hostId = 'local'; f.document.querySelector('main').append(row); assert.equal(session.resolveThreadReference(row), null);
  f.document.getElementById('root').append(f.document.querySelector('main').cloneNode(true)); await f.flush();
  assert.equal(session.getSurface().available, false); assert.equal(session.getSnapshot().diagnostic.code, 'workspace_host_drift');
});

test('loaded summaries are bounded metadata only, update one affected thread and emit nothing for unchanged tokens', () => {
  const threads = new Map(Array.from({ length: 105 }, (_, i) => ['thread-' + i, { id: 'thread-' + i, title: 'Task ' + i, cwd: 'X:/fixture', resumeState: 'resumed', turns: [{ status: i === 0 ? 'inProgress' : 'completed', items: [{ text: 'private history' }] }], requests: [] }]));
  let enumerations = 0; const events = [], manager = { getCachedConversations() { enumerations++; return [...threads.values()]; }, getConversation: id => threads.get(id) };
  const summaries = createLoadedThreads(manager, event => events.push(event), 'instance');
  const first = summaries.read({ limit: 100 }); assert.equal(first.threads.length, 100); assert.ok(first.cursor); assert.equal(first.threads[0].runtimeStatus, 'running'); assert.equal('turns' in first.threads[0], false);
  for (let i = 0; i < 1000; i++) { threads.get('thread-0').turns[0].items[0].text += 'x'; summaries.refresh('thread-0'); }
  assert.equal(events.length, 0); assert.equal(enumerations, 1);
  threads.get('thread-0').requests.push({ id: 'approval' }); summaries.refresh('thread-0'); assert.equal(events.length, 1); assert.equal(events[0].thread.runtimeStatus, 'attention');
  const last = summaries.read({ cursor: first.cursor }); assert.equal(last.threads.length, 5); assert.equal(last.cursor, null);
  assert.throws(() => summaries.read({ cursor: first.cursor }), { code: 'invalid_argument' });
  threads.delete('thread-0'); summaries.refresh('thread-0'); assert.equal(events.at(-1).thread, null);
  assert.deepEqual(summaries.read({ threadId: 'missing' }), { threads: [], cursor: null }); assert.equal(enumerations, 1); summaries.dispose();
});

function native(f) {
  const N = { ...f.window.eval(nativeSource + ';NativeShell;') }, context = N.React.createContext(null);
  const provider = { dependencies: { firstContext: { context, memoizedValue: 'native-app-scope' } } };
  f.document.querySelector('[data-includes-composer]').__reactFiber$providers = provider;
  f.document.getElementById('activity').__reactFiber$fixture.return = provider;
  let roots = 0; const createRoot = N.Client.createRoot;
  N.Client = { createRoot(...args) { roots++; return createRoot(...args); } };
  N.roots = () => roots; return N;
}

test('transcripts share discovery/history/listener, preserve roots and scroll on flags, and retire late work', async t => {
  const f = fixture(t), N = native(f), owner = f.connect(), conversations = new Map(), callbacks = new Set();
  let discoveries = 0, loads = 0, interests = 0;
  N.manager = { getConversation: id => conversations.get(id), async loadBackgroundThreadHistoryPage(id) { loads++; await tick(); conversations.set(id, { resumeState: 'resumed' }); }, addConversationStateCallback(fn) { callbacks.add(fn); return () => callbacks.delete(fn); } };
  N.Scope = ({ children }) => children; N.composerScope = {}; N.composerValue = route => ({ id: route.conversationId });
  N.ThreadSubscription = () => null;
  N.Content = ({ conversationId }) => { N.React.useEffect(() => { interests++; return () => interests--; }, [conversationId]); return N.React.createElement('div', { className: 'thread-scroll-container' }, N.React.createElement('div', { 'data-thread-find-target': 'conversation' }, 'native content ' + conversationId)); };
  f.discovery.transcript = async () => { discoveries++; return N; };
  const states = [], handles = Array.from({ length: 12 }, (_, index) => { const box = f.document.createElement('div'); f.document.body.append(box); return owner.session.mountTranscript(box, { threadId: 'thread-a', onState: state => { if (index === 0) states.push(state.phase); } }); });
  await Promise.all(handles.map(handle => handle.ready)); await tick();
  assert.equal(discoveries, 1); assert.equal(loads, 1); assert.equal(callbacks.size, 1); assert.equal(N.roots(), 12); assert.equal(interests, 12);
  handles[0].setScrollPosition({ top: 123, left: 9 }); handles[0].update({ readOnly: false, trackReadState: true }); await tick();
  assert.deepEqual(plain(handles[0].getScrollPosition()), { top: 123, left: 9 }); assert.equal(N.roots(), 12); assert.equal(loads, 1); assert.equal(interests, 12);
  assert.deepEqual(states, ['loading', 'ready']);
  handles[0].setScrollPosition({ top: -41, left: -9 }); assert.deepEqual(plain(handles[0].getScrollPosition()), { top: -41, left: -9 });
  handles[0].update({ threadId: 'thread-b' }); await tick(); await tick(); assert.equal(loads, 2); assert.equal(N.roots(), 12);
  owner.ctx.retire(); assert.equal(callbacks.size, 0); assert.equal(interests, 0); assert.equal(f.document.querySelectorAll('[data-codlet-workspace-owned]').length, 0);
  assert.throws(() => handles[0].getScrollPosition(), { code: 'workspace_retired' });
});

test('native shortcut capture/clear/restore/search and programmatic conflicts retain consumer ownership', async t => {
  const f = fixture(t), N = native(f), owner = f.connect(), changes = [], commands = new Map(); let invocations = 0;
  N.platform = 'windows'; N.keymap = () => ({ bindings: [] }); N.commands = [{ id: 'native.command', electron: { menuTitle: 'Native action' } }]; N.bindings = () => [{ accelerator: 'Ctrl+K' }];
  N.eventAccelerator = event => [...event.ctrlKey ? ['Ctrl'] : [], ...event.altKey ? ['Alt'] : [], ...event.shiftKey ? ['Shift'] : [], event.key].join('+');
  N.useCommand = (id, handler) => N.React.useEffect(() => { commands.set(id, handler); return () => commands.delete(id); }, [id, handler]);
  N.dispatchKeyboard = id => { commands.get(id)?.(); return commands.has(id); };
  N.Row = ({ label, control }) => N.React.createElement('section', null, label, control);
  N.Capture = props => N.React.createElement('div', null,
    N.React.createElement('button', { 'data-test-edit': '', onClick: () => props.onCapture('Ctrl+Alt+Shift+F10') }, 'edit'),
    N.React.createElement('button', { 'data-test-conflict': '', onClick: () => props.onCapture('Ctrl+K') }, 'conflict'),
    N.React.createElement('button', { 'data-test-clear': '', onClick: props.onClear }, 'clear'),
    N.React.createElement('button', { 'data-test-restore': '', disabled: !props.onReset, onClick: props.onReset }, 'restore'),
    props.conflict ? N.React.createElement('span', { role: 'alert' }, props.conflict) : null);
  const settings = f.document.createElement('div'); settings.className = '@container/keyboard-shortcuts'; const input = f.document.createElement('input'); settings.append(input); f.document.getElementById('root').append(settings);
  input.__reactFiber$settings = { type: function Search() { return 'settings.keyboardShortcuts.search.placeholder'; }, return: f.document.querySelector('[data-includes-composer]').__reactFiber$providers };
  f.discovery.shortcuts = async () => N;
  const handle = owner.session.registerShortcut({ id: 'toggle', label: 'Toggle workspace', accelerator: 'Ctrl+Alt+Shift+F12', onInvoke() { invocations++; }, onChange(value) { changes.push(value); } }); await handle.ready; await tick();
  assert.equal(commands.size, 1); settings.querySelector('[data-test-conflict]').click(); await tick(); assert.equal(settings.querySelector('[role=alert]').textContent, 'Native action'); assert.equal(changes.length, 0);
  settings.querySelector('[data-test-edit]').click(); await tick(); assert.equal(handle.getSnapshot().accelerator, 'Ctrl+Alt+Shift+F10');
  settings.querySelector('[data-test-clear]').click(); await tick(); assert.equal(handle.getSnapshot().accelerator, null);
  settings.querySelector('[data-test-restore]').click(); await tick(); assert.equal(handle.getSnapshot().accelerator, 'Ctrl+Alt+Shift+F12'); assert.deepEqual(changes, ['Ctrl+Alt+Shift+F10', null, 'Ctrl+Alt+Shift+F12']);
  assert.throws(() => handle.update({ accelerator: 'Ctrl+K' }), { code: 'shortcut_conflict' });
  f.document.body.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F12', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true })); assert.equal(invocations, 1);
  input.value = 'no match'; input.dispatchEvent(new f.window.Event('input', { bubbles: true })); await tick(); assert.equal(settings.querySelector('[data-test-edit]'), null);
  owner.ctx.retire(); assert.equal(commands.size, 0); assert.equal(f.document.querySelectorAll('[data-codlet-workspace-owned]').length, 0);
});

test('lazy keymap discovery parses the original bounded declaration after Native memoizes its initializer, without evaluating source', () => {
  const source = 'function renamedInitializer(){return renamedInitializer=lazy(()=>{query=create(scope,"codex-command-keymap-state");derived=signal(scope,({get})=>{let {data:value}=get(query);return value?{...value,primaryNumberShortcutTarget:void 0}:value;});})();}export{derived as differentlyNamedKeymap}';
  assert.equal(keymapExport({ anything: () => {} }, source), 'differentlyNamedKeymap');
  assert.throws(() => keymapExport({}, source + '"codex-command-keymap-state"'), { code: 'workspace_shortcuts_unavailable' });
  assert.deepEqual(assetReferences('import("./local-conversation-thread-NEW_HASH.js");"./local-conversation-thread-NEW_HASH.js";', 'app://-/assets/app-initial-anotherHash.js', 'local-conversation-thread'), ['app://-/assets/local-conversation-thread-NEW_HASH.js']);
});

test('opaque native source proxies fail closed and are inspected only once', () => {
  let reads = 0; const value = { get render() { reads++; throw Error('Opaque UIKit proxy'); } };
  assert.equal(componentSource(value), ''); assert.equal(componentSource(value), ''); assert.equal(reads, 1);
});

test('consumer retirement before native discovery resolves prevents late roots, listeners and history requests', async t => {
  const f = fixture(t), N = native(f), owner = f.connect(); let resolve, histories = 0, listeners = 0;
  N.manager = { getConversation() {}, loadBackgroundThreadHistoryPage() { histories++; }, addConversationStateCallback() { listeners++; return () => listeners--; } };
  f.discovery.transcript = () => new Promise(done => { resolve = done; });
  const box = f.document.createElement('div'); f.document.body.append(box);
  const handle = owner.session.mountTranscript(box, { threadId: 'thread-a' }); await tick(); owner.ctx.retire();
  await assert.rejects(handle.ready, { code: 'workspace_retired' }); resolve(N); await tick();
  assert.equal(N.roots(), 0); assert.equal(histories, 0); assert.equal(listeners, 0); assert.equal(box.childNodes.length, 0);
});

test('hidden native documents reconcile event bursts without animation-frame throttling or periodic timers', async t => {
  const f = fixture(t), owner = f.connect(); Object.defineProperty(f.document, 'visibilityState', { value: 'hidden', configurable: true });
  let changes = 0; owner.session.subscribe(() => changes++);
  f.navigator.location.pathname = '/local/thread-b';
  for (let i = 0; i < 40; i++) f.document.querySelector('nav').append(f.document.createElement('span'));
  await tick(); assert.equal(owner.session.getSnapshot().threadId, 'thread-b'); assert.equal(f.stats().frameCount, 0); assert.equal(changes, 2);
  owner.ctx.retire(); await tick(); assert.equal(f.frames.size, 0);
});
