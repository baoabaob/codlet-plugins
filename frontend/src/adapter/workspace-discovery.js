import { parseExpressionAt } from 'acorn';
import { loadedAsset, localConnection, uniqueExport, componentSource } from '../host-discovery.js';
import { workspaceError } from './workspace-dom.js';

export async function readWorkspaceAsset(url, signal) {
  const response = await fetch(url, { credentials: 'omit', signal });
  if (!response.ok || response.url !== url) throw workspaceError('workspace_host_drift', 'Unable to read the loaded workspace module');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 16 * 1024 * 1024) throw workspaceError('workspace_host_drift', 'Workspace module exceeds the discovery limit'); chunks.push(value); }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
export function assetReferences(source, parent, role) {
  if (!/^[a-z-]+$/.test(role)) throw workspaceError('invalid_argument', 'Invalid native module role');
  const pattern = new RegExp('["\'`]((?:\\./)?' + role + '-[A-Za-z0-9_-]+\\.js)["\'`]', 'g');
  return [...new Set([...source.matchAll(pattern)].map(match => new URL(match[1], parent).href))].filter(url => /^app:\/\/-\/assets\/[A-Za-z0-9_-]+\.js$/.test(url));
}
function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (node.type) fn(node);
  for (const [key, value] of Object.entries(node)) if (!['start', 'end'].includes(key)) {
    if (Array.isArray(value)) value.forEach(item => visit(item, fn)); else if (value && typeof value === 'object') visit(value, fn);
  }
}
export function keymapExport(initial, source) {
  // Rolldown replaces an initialized exported lazy function with a memoized
  // wrapper. Inspect its original module declaration, never call the wrapper
  // to guess a role and never parse the complete multi-megabyte module AST.
  const marker = 'codex-command-keymap-state', markerAt = source.indexOf(marker);
  if (markerAt < 0 || source.indexOf(marker, markerAt + marker.length) >= 0) throw workspaceError('workspace_shortcuts_unavailable', 'Native keymap query is missing or ambiguous');
  const declarations = [...source.slice(0, markerAt).matchAll(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g)], start = declarations.at(-1)?.index;
  if (start == null) throw workspaceError('workspace_shortcuts_unavailable', 'Native keymap declaration is unavailable');
  const ast = parseExpressionAt(source, start, { ecmaVersion: 'latest' }), candidates = new Set();
  if (ast.end <= markerAt || ast.end - ast.start > 32768) throw workspaceError('workspace_shortcuts_unavailable', 'Native keymap declaration exceeds the discovery boundary');
  visit(ast, node => {
    if (node.type !== 'AssignmentExpression' || node.left.type !== 'Identifier' || node.right.type !== 'CallExpression' || node.right.arguments.length !== 2) return;
    const part = source.slice(node.right.start, node.right.end);
    if (part.includes('primaryNumberShortcutTarget') && (part.includes('.data') || /\bdata\s*:/.test(part))) candidates.add(node.left.name);
  });
  if (candidates.size !== 1) throw workspaceError('workspace_shortcuts_unavailable', 'Native keymap signal is missing or ambiguous');
  const local = [...candidates][0], tail = source.slice(source.lastIndexOf('export'));
  const pattern = new RegExp('(?:\\{|,)\\s*' + local.replace(/[$]/g, '\\$&') + '\\s+as\\s+([A-Za-z_$][\\w$]*)\\s*(?=,|\\})', 'g');
  const aliases = [...tail.matchAll(pattern)].map(match => match[1]);
  if (aliases.length !== 1) throw workspaceError('workspace_shortcuts_unavailable', 'Native keymap export is missing or ambiguous');
  return aliases[0];
}
const markers = (value, list) => { const source = componentSource(value); return list.every(marker => source.includes(marker)); };

// One cache per provider lifetime; lazy modules never initialize in pet windows.
export function createWorkspaceDiscovery(baseNative, { load = url => import(url), read = readWorkspaceAsset, connect = localConnection } = {}) {
  const controller = new AbortController(), sources = new Map(), modules = new Map();
  let common, transcript, shortcuts, connection;
  const source = url => { if (!sources.has(url)) sources.set(url, read(url, controller.signal)); return sources.get(url); };
  const module = url => { if (!modules.has(url)) modules.set(url, load(url)); return modules.get(url); };
  const existing = () => {
    connection ??= connect();
    if (connection.check) return connection.check();
    const { node, chain, managerFamily, clientFamily, manager, client } = connection;
    if (managerFamily.read(node, chain, 'local') !== manager || clientFamily.read(node, chain, 'local') !== client || manager.requestClient !== client)
      throw workspaceError('workspace_host_drift', 'The existing local Desktop connection was replaced');
    return connection;
  };
  const getCommon = () => common ??= (async () => {
    const native = await baseNative(), sharedUrl = loadedAsset('shared'), initialUrl = loadedAsset('initial');
    if (!native?.React || !native?.Client) throw workspaceError('workspace_host_pending', 'Native React is not ready');
    const [shared, initial] = await Promise.all([module(sharedUrl), module(initialUrl)]);
    return { ...native, shared, initial, sharedUrl, initialUrl };
  })();
  return {
    connection: existing,
    transcript: () => transcript ??= (async () => {
      const native = await getCommon(), graph = await source(native.initialUrl), urls = assetReferences(graph, native.initialUrl, 'local-conversation-thread');
      if (!urls.length || urls.length > 8) throw workspaceError('workspace_transcript_unavailable', 'Native transcript modules are missing or ambiguous');
      const candidates = await Promise.all(urls.map(async url => ({ url, source: await source(url) })));
      const wrappers = candidates.filter(value => value.source.includes('LocalConversationSideChatTab') && !value.source.includes('retainActiveInterest'));
      const implementations = candidates.filter(value => value.source.includes('trackReadState') && value.source.includes('retainActiveInterest'));
      if (wrappers.length !== 1 || implementations.length !== 1) throw workspaceError('workspace_transcript_unavailable', 'The native transcript entry contract changed');
      // The semantic wrapper runs Native's own initializer. Source is never evaluated.
      await module(wrappers[0].url);
      const thread = await module(implementations[0].url);
      const Content = uniqueExport(thread, value => markers(value, ['trackReadState', 'retainActiveInterest', 'contentSearchOrchestrationId', 'enableMcpApps']), 'transcript content');
      const Scope = uniqueExport(native.shared, value => markers(value, ['Missing parent scope', 'providedValue']), 'scope provider');
      const composerScope = uniqueExport(native.shared, value => value?.__scopeBrand === 'ComposerScope' && typeof value.id === 'symbol', 'composer scope');
      const composerValue = uniqueExport(native.shared, value => markers(value, ['routeKind', 'local-thread', 'client-local-thread', 'browserTabMentionConversationId']), 'composer scope value');
      const primaryUrls = assetReferences(graph, native.initialUrl, 'app-primary');
      if (primaryUrls.length !== 1) throw workspaceError('workspace_transcript_unavailable', 'A unique native thread subscription module is required');
      const primary = await module(primaryUrls[0]);
      const ThreadSubscription = uniqueExport(primary, value => markers(value, ['threadKey', 'cancelRelease', 'useSyncExternalStore', 'hostId', 'threadId']), 'thread subscription');
      const manager = existing().manager;
      for (const method of ['getConversation', 'loadBackgroundThreadHistoryPage', 'addConversationStateCallback'])
        if (typeof manager[method] !== 'function') throw workspaceError('workspace_transcript_unavailable', `Native transcript manager lacks ${method}`);
      return { ...native, Content, ThreadSubscription, Scope, composerScope, composerValue, manager };
    })(),
    shortcuts: () => shortcuts ??= (async () => {
      const native = await getCommon(), graph = await source(native.initialUrl), urls = assetReferences(graph, native.initialUrl, 'app-primary');
      const settingsUrls = assetReferences(graph, native.initialUrl, 'keyboard-shortcuts-settings');
      if (!settingsUrls.length || settingsUrls.length > 4) throw workspaceError('workspace_shortcuts_unavailable', 'Native shortcut settings entries are unavailable');
      const settings = await Promise.all(settingsUrls.map(async url => ({ url, source: await source(url) })));
      const wrappers = settings.filter(value => value.source.includes('KeyboardShortcutsSettings') && !value.source.includes('settings.keyboardShortcuts.resetAllConfirm'));
      if (wrappers.length !== 1) throw workspaceError('workspace_shortcuts_unavailable', 'The native shortcut settings entry changed');
      await module(wrappers[0].url);
      if (urls.length !== 1) throw workspaceError('workspace_shortcuts_unavailable', 'A unique native shortcut control module is required');
      const primary = await module(urls[0]);
      const Capture = uniqueExport(primary, value => markers(value, ['allowsBareModifiers', 'allowsSequences', 'captureAriaLabel', 'onStartCapture']), 'shortcut capture control');
      const eventAccelerator = uniqueExport(primary, value => typeof value === 'function' && value.length === 1 && componentSource(value).length < 1024 &&
        markers(value, ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'Command', '.join(']), 'keyboard event accelerator');
      const Row = uniqueExport(native.shared, value => markers(value, ['labelSizing', 'controlSizing', 'description', 'control']), 'settings row');
      const useCommand = uniqueExport(native.initial, value => markers(value, ['contextHandler', 'keyboardHandler', 'menuItem', 'useEffect']), 'command hook');
      const dispatchKeyboard = uniqueExport(native.initial, value => typeof value === 'function' && value.length === 3 && markers(value, ['keyboard_shortcut']) && componentSource(value).length < 256, 'keyboard command dispatch');
      const bindings = uniqueExport(native.initial, value => typeof value === 'function' && markers(value, ['keymapState', 'accelerator:', 'label:', 'macOS', 'chatgpt']) && componentSource(value).length < 2048, 'effective shortcut bindings');
      const commands = uniqueExport(native.initial, value => Array.isArray(value) && value.some(command => command?.id === 'newTask') && value.some(command => command?.id === 'keyboardShortcuts'), 'command definitions');
      const keymap = native.initial[keymapExport(native.initial, graph)], connection = existing();
      if (keymap?.scope !== connection.node.token || typeof keymap.resolve !== 'function' || typeof connection.node.store?.get !== 'function') throw workspaceError('workspace_shortcuts_unavailable', 'Native shortcut keymap ownership or signal contract changed');
      // Current Native's unexported detector uses navigator.platform. Use the
      // actual client identity with explicit unsupported handling, never a fixed
      // Windows argument. macOS derivation is not macOS acceptance evidence.
      const identity = globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform ?? '';
      const platform = /^(Win|Windows)/.test(identity) ? 'windows' : /^(Mac|macOS)/.test(identity) ? 'macOS' : /^(Linux|linux)/.test(identity) ? 'linux' : null;
      if (!['windows', 'macOS', 'linux'].includes(platform)) throw workspaceError('workspace_shortcuts_unavailable', 'The native shortcut platform is unknown');
      return { ...native, Capture, Row, useCommand, dispatchKeyboard, eventAccelerator, bindings, commands, platform,
        keymap: () => {
          if (!connection.node.cachedBindings?.has(keymap)) throw workspaceError('workspace_host_pending', 'Waiting for Native to bind its shortcut keymap');
          return connection.node.store.get(keymap.resolve(connection.node, connection.chain));
        } };
    })(),
    dispose() { controller.abort(); sources.clear(); modules.clear(); connection = null; common = transcript = shortcuts = null; },
  };
}
