'use strict';
const Module = require('node:module');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { AsyncLocalStorage } = require('node:async_hooks');

// Private symbols are specific to source-reviewed Owl builds. The hashes
// guard every append; a new build needs a new inspected profile.
const PROFILES = Object.freeze({
  'bootstrap-CiIGnI3y.js': { hash: '119bb54ee12ed5d2b0d3b98dd068a4322232a4aa342323eb9cb5dfa6575ca158', kind: 'bootstrap', symbol: 'Nt' },
  'main-BR_2NHW6.js': { hash: '1f2b91cf92fc023fb2fa41e1c1d03698fa6e37354ecd07dd0cebd21337607b08', kind: 'main', symbol: 'ZTe' },
  'bootstrap-DK4EfNwt.js': { hash: 'dbdbdd3ef5dde93dd196a59846edf244dc653341213e0fd45eebb133b5df10ba', kind: 'bootstrap', symbol: 'Pt' },
  'main-LM8MUIFp.js': { hash: 'c71bf3ffecef5fd390b4cd16d120d39dce30d30bffe3c563c8c74c1b691da018', kind: 'main', symbol: 'wEe' },
  'src-C3YaUE83.js': { hash: '14c8c23e8b8dfa874d3fb5a50d54fb28eccf55fb83232c3ab29cb7c0ef0a0472', kind: 'src', symbol: 'mQ', managerExport: 'un' },
  'bootstrap-DwqRMhlU.js': { hash: '79ad86bda1f6171d43bab09b1b4a5d379afefc07a13d6f4f58470a823f6f575f', kind: 'bootstrap', symbol: 'Nt' },
  'main-Bx5zswAj.js': { hash: '610ea8b045f207360ac50fcccfe43ca896c6298fa75562f323f1a45ed2364a1b', kind: 'main', symbol: 'ZTe' },
  'src-mOb8On4V.js': { hash: '0639e87d51c132a7440bfa06624fb8e99031a3bb331ae11577278ce4a515cbb4', kind: 'src', symbol: 'Pq', managerExport: 'un' },
  'bootstrap-C4dRql4x.js': { hash: '0757af0981f4552ca79ed1a364eafa6a73e71a92e65ea4fce747c7b6c715ed4a', kind: 'bootstrap', symbol: 'Nt' },
  'main-C-Mhak1n.js': { hash: '457c79be69620d4489e94c14ac665f81731d869635606dcf175b7b4cc2e8b467', kind: 'main', symbol: 'ZTe' },
  'src-DldfpmrL.js': { hash: '88ec69722b5d87a7081edf2e2d6a2e21c3f25300cee587363d74b8b87969a412', kind: 'src', symbol: 'WQ', managerExport: 'un' },
});
const HASHES = Object.freeze(Object.fromEntries(Object.entries(PROFILES).map(([name, profile]) => [name, profile.hash])));
const fail = code => Object.assign(new Error(code), { code });
const closeRoute = route => { try { Promise.resolve(route.close()).catch(() => {}); } catch {} };
function headers(value) {
  if (Array.isArray(value)) return value.flatMap(([name, item]) => (Array.isArray(item) ? item : [item]).map(part => [name, String(part)]));
  if (value && !(value instanceof Headers) && typeof value === 'object') return Object.entries(value).flatMap(([name, item]) => (Array.isArray(item) ? item : [item]).map(part => [name, String(part)]));
  const source = new Headers(value ?? {}), result = [...source.entries()].filter(([name]) => name.toLowerCase() !== 'set-cookie');
  for (const cookie of source.getSetCookie?.() ?? []) result.push(['set-cookie', cookie]);
  return result;
}
const sameOrigin = (left, right) => new URL(left).origin === new URL(right).origin;
const withoutCredentials = values => headers(values).filter(([name]) => !['authorization', 'cookie', 'proxy-authorization'].includes(name.toLowerCase()));
function headerObject(values) {
  const result = Object.create(null);
  for (const [name, value] of values) {
    const key = Object.keys(result).find(existing => existing.toLowerCase() === name.toLowerCase()) ?? name;
    result[key] = result[key] === undefined ? value : Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
  }
  return result;
}
const requestBody = value => value == null ? undefined : typeof value === 'string' ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : value;
const asUrl = value => typeof value === 'string' ? value : value instanceof URL ? value.href : value?.url;

async function bytes(body, signal) {
  if (body == null || typeof body === 'string' || body instanceof Uint8Array) return body;
  const chunks = []; let size = 0;
  for await (const chunk of body) { signal?.throwIfAborted(); size += chunk.length; if (size > 64 * 1024 * 1024) throw fail('desktop_body_too_large'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
function stream(body) {
  if (body == null || typeof body === 'string' || body instanceof Uint8Array) return body;
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) { try { const item = await iterator.next(); item.done ? controller.close() : controller.enqueue(item.value); } catch (error) { controller.error(error); } },
    cancel() { body.cancel?.(); iterator.return?.(); },
  });
}
const bodyless = (status, method) => [204, 205, 304].includes(status) || method?.toUpperCase() === 'HEAD';
async function response(result, method) {
  const options = { status: result.status, headers: result.headers };
  if (bodyless(result.status, method)) {
    await result.body?.cancel?.();
    return new Response(null, options);
  }
  return new Response(stream(result.body), options);
}
function providerUrl(value) {
  if (typeof value !== 'string') throw fail('backend_provider_unsupported');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw fail('backend_provider_unsupported');
  return url.href;
}
function routedThreadMessage(message, reserve, isProviderSupported = () => true) {
  let payload; try { payload = JSON.parse(message); } catch { return message; }
  if (!['thread/start', 'thread/resume'].includes(payload?.method)) return message;
  const inputConfig = payload.params?.config;
  const selected = payload.params?.modelProvider ?? inputConfig?.model_provider;
  const inline = typeof selected === 'string' ? inputConfig?.[`model_providers.${selected}`] ?? inputConfig?.model_providers?.[selected] : null;
  if (typeof selected === 'string' && !isProviderSupported(selected) && typeof inline?.base_url !== 'string') throw fail('backend_provider_unsupported');
  if (!inputConfig || typeof inputConfig !== 'object' || Array.isArray(inputConfig)) return message;
  const config = { ...inputConfig }; let changed = false;
  for (const [key, value] of Object.entries(config)) {
    if (key === 'model_providers' && value && typeof value === 'object' && !Array.isArray(value)) {
      const mapped = { ...value };
      for (const [name, provider] of Object.entries(mapped)) if (provider && typeof provider === 'object' && typeof provider.base_url === 'string') {
        if (!/^[A-Za-z0-9_-]{1,64}$/u.test(name)) throw fail('backend_provider_unsupported');
        mapped[name] = { ...provider, base_url: reserve(providerUrl(provider.base_url)) }; changed = true;
      }
      config[key] = mapped;
    } else if (/^model_providers\..*\.base_url$/u.test(key) && !/^model_providers\.[A-Za-z0-9_-]{1,64}\.base_url$/u.test(key)) throw fail('backend_provider_unsupported');
    else if (/^model_providers\..+$/u.test(key) && value && typeof value === 'object' && typeof value.base_url === 'string'
      && !/^model_providers\.[A-Za-z0-9_-]{1,64}$/u.test(key)) throw fail('backend_provider_unsupported');
    if (key === 'openai_base_url' || /^model_providers\.[A-Za-z0-9_-]{1,64}\.base_url$/u.test(key)) {
      config[key] = reserve(providerUrl(value)); changed = true;
    } else if (/^model_providers\.[A-Za-z0-9_-]{1,64}$/u.test(key) && value && typeof value === 'object' && typeof value.base_url === 'string') {
      config[key] = { ...value, base_url: reserve(providerUrl(value.base_url)) }; changed = true;
    }
  }
  return changed ? JSON.stringify({ ...payload, params: { ...payload.params, config } }) : message;
}

// Scope final ApplicationNetwork calls to the reviewed performDesktopFetch
// classes, after their auth, workspace policy and cancellation decisions.
function installDesktopPlaintext({ app }, { source, deadlineUnixMs, ownsBackendProcess = () => false, isProviderSupported = () => true,
  providerTrustForProcess = () => undefined,
  pendingAccountUpdate = () => null, updateAccountMode = () => {} }, { expectedHashes = HASHES } = {}) {
  if (app.isReady() || !source?.interceptHttp) throw fail('desktop_bootstrap_too_late');
  const scope = new AsyncLocalStorage();
  const symbol = Symbol('codlet.private.plaintext');
  const originalCompile = Module.prototype._compile;
  let bootstrapVerified = false, mainVerified = false, srcVerified = false, fetchInstalled = false, requestInstalled = false,
    stdioInstalled = false, connectionInstalled = false, desktopReason = null, taskReason = null, mismatch = null, closed = false;
  const restores = [];
  const taskRoutes = new Set(), routesByProcess = new WeakMap(), sendQueues = new WeakMap();
  function reserve(url, proc) {
    let routes = routesByProcess.get(proc);
    if (!routes) {
      routes = new Map(); routesByProcess.set(proc, routes);
      proc.once('exit', () => { for (const route of routes.values()) { closeRoute(route); taskRoutes.delete(route); } routes.clear(); });
    }
    if (routes.has(url)) return routes.get(url);
    if (taskRoutes.size >= 64) throw fail('backend_route_limit');
    const additionalCaPem = providerTrustForProcess(proc);
    const route = source.reserveRoute({ upstreamBaseUrl: url, ...(additionalCaPem === undefined ? {} : { additionalCaPem }) });
    route.ready.catch(() => { routes.delete(url); taskRoutes.delete(route); closeRoute(route); });
    routes.set(url, route); taskRoutes.add(route);
    return route;
  }
  function failOutbound(connection, message) {
    let id; try { id = JSON.parse(message).id; } catch {}
    if (typeof id === 'string' || typeof id === 'number') queueMicrotask(() => connection.onmessage?.({ type: 'message',
      data: JSON.stringify({ id, error: { code: -32000, message: 'Provider route unavailable' } }) }));
    else connection.onerror?.(fail('backend_route_unavailable'));
  }
  function hookStdio(Stdio) {
    if (stdioInstalled || typeof Stdio !== 'function' || typeof Stdio.prototype.send !== 'function') { if (!stdioInstalled) taskReason = 'hook_unavailable'; return; }
    const original = Stdio.prototype.send;
    Stdio.prototype.send = function(message) {
      if (closed || !ownsBackendProcess(this.proc) || typeof message !== 'string') return original.call(this, message);
      const waits = []; let routed;
      try { routed = routedThreadMessage(message, url => { const route = reserve(url, this.proc); waits.push(route.ready); return route.baseUrl; },
        provider => isProviderSupported(this.proc, provider)); }
      catch { failOutbound(this, message); return; }
      const account = pendingAccountUpdate(this.proc);
      const previous = sendQueues.get(this);
      if (!waits.length && !account && !previous) return original.call(this, routed);
      const operation = (previous ?? Promise.resolve()).then(() => Promise.all([...waits, ...(account ? [account] : [])])).then(() => {
        if (!closed && ownsBackendProcess(this.proc)) original.call(this, routed); else failOutbound(this, message);
      }).catch(() => failOutbound(this, message));
      sendQueues.set(this, operation);
      operation.finally(() => { if (sendQueues.get(this) === operation) sendQueues.delete(this); }).catch(() => {});
    };
    stdioInstalled = true;
    restores.push(() => { Stdio.prototype.send = original; });
  }
  function hookConnection(Connection) {
    if (connectionInstalled || typeof Connection !== 'function' || typeof Connection.prototype.routeIncomingMessage !== 'function') { if (!connectionInstalled) taskReason = 'hook_unavailable'; return; }
    const original = Connection.prototype.routeIncomingMessage;
    Connection.prototype.routeIncomingMessage = function(message, ...rest) {
      if (!closed && message?.method === 'account/updated' && ownsBackendProcess(this.connection?.proc)) updateAccountMode(this.connection.proc, message.params?.authMode);
      return original.call(this, message, ...rest);
    };
    connectionInstalled = true;
    restores.push(() => { Connection.prototype.routeIncomingMessage = original; });
  }
  function hookNetwork(Network) {
    if (typeof Network !== 'function' || typeof Network.prototype.fetch !== 'function' || typeof Network.prototype.request !== 'function') { desktopReason = 'hook_unavailable'; return; }
    const originalFetch = Network.prototype.fetch, originalRequest = Network.prototype.request;
    function nativeForward(network, request, options, signal, onRequest) {
      return new Promise((resolve, reject) => {
        let settled = false, finalUrl = request.url, redirects = 0, live;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          if (error) reject(error); else resolve(value);
        };
        const abort = () => { finish(fail('desktop_request_aborted')); live?.abort(); };
        try {
          signal?.throwIfAborted();
          live = originalRequest.call(network, { ...options, url: request.url, method: request.method,
            headers: headerObject(headers(request.headers)) });
          onRequest?.(live);
          signal?.addEventListener('abort', abort, { once: true });
          live.on('redirect', (_status, _method, destination) => {
            try {
              if (options.redirect === 'error') throw fail('desktop_redirect_disallowed');
              if (options.redirect === 'manual') throw fail('desktop_manual_redirect_unavailable');
              if (++redirects > 20 || !['http:', 'https:'].includes(new URL(destination).protocol)) throw fail('desktop_redirect_disallowed');
              network.assertAllowed(destination);
              finalUrl = destination;
              // Electron requires this call during the event. The intermediate
              // response body is unavailable through ClientRequest.
              live.followRedirect();
            } catch (error) { finish(error); live.abort(); }
          });
          live.once('error', error => { signal?.removeEventListener('abort', abort); finish(error); });
          live.once('response', incoming => {
            incoming.once('end', () => signal?.removeEventListener('abort', abort));
            incoming.once('close', () => signal?.removeEventListener('abort', abort));
            finish(null, { status: incoming.statusCode, headers: headers(incoming.headers), body: incoming, finalUrl });
          });
          live.end(request.body == null || typeof request.body === 'string' ? request.body : Buffer.from(request.body));
        } catch (error) { signal?.removeEventListener('abort', abort); finish(error); live?.abort(); }
      });
    }
    Network.prototype.fetch = async function(input, init = {}) {
      if (closed || !scope.getStore()) return originalFetch.call(this, input, init);
      const url = asUrl(input); this.assertAllowed(url);
      const signal = init.signal;
      const current = { url, method: init.method ?? 'GET', headers: headers(init.headers), body: requestBody(init.body) };
      const result = await source.interceptHttp(current, { signal, forward: async (next, control) => {
        const body = await bytes(next.body, control.signal);
        const omit = next.credentialMode === 'omit' || !sameOrigin(url, next.url);
        return nativeForward(this, { ...next, body, headers: omit ? withoutCredentials(next.headers) : next.headers }, { redirect: init.redirect ?? 'follow',
          credentials: omit ? 'omit' : init.credentials, cache: init.cache, referrerPolicy: init.referrerPolicy,
          priority: init.priority, ...(init.credentials === 'same-origin' && !omit ? { origin: new URL(url).origin } : {}) }, control.signal);
      } });
      return response(result, current.method);
    };
    Network.prototype.request = function(options) {
      if (closed || !scope.getStore()) return originalRequest.call(this, options);
      this.assertAllowed(options.url);
      const network = this;
      const proxy = new EventEmitter();
      const controller = new AbortController();
      let liveRequest, upload = { started: false, current: 0, total: 0 }, ended = false;
      proxy.getUploadProgress = () => liveRequest?.getUploadProgress?.() ?? upload;
      proxy.abort = () => { controller.abort(); liveRequest?.abort?.(); };
      proxy.end = function(body) {
        if (ended) throw fail('desktop_request_already_ended'); ended = true;
        const send = async () => {
          const current = { url: options.url, method: options.method ?? 'GET', headers: headers(options.headers), body: requestBody(body) };
          const result = await source.interceptHttp(current, { signal: controller.signal, forward: async (next, control) => {
            const forwardBody = await bytes(next.body, control.signal);
            const omit = next.credentialMode === 'omit' || !sameOrigin(options.url, next.url);
            return nativeForward(network, { ...next, body: forwardBody, headers: omit ? withoutCredentials(next.headers) : next.headers }, { ...options, redirect: options.redirect ?? 'follow',
              credentials: omit ? 'omit' : options.credentials,
              useSessionCookies: !omit && options.useSessionCookies === true }, control.signal,
            request => { liveRequest = request; upload = request.getUploadProgress?.() ?? upload; });
          } });
          if (bodyless(result.status, current.method)) await result.body?.cancel?.();
          const output = Readable.from(bodyless(result.status, current.method) ? [] : result.body ?? []);
          output.statusCode = result.status; output.statusMessage = ''; output.headers = headerObject(result.headers);
          proxy.emit('response', output);
        };
        send().catch(error => proxy.emit('error', error));
      };
      requestInstalled = true;
      return proxy;
    };
    fetchInstalled = true; requestInstalled = true;
    restores.push(() => { Network.prototype.fetch = originalFetch; Network.prototype.request = originalRequest; });
  }
  function hookFetchWrapper(FetchWrapper) {
    if (typeof FetchWrapper !== 'function' || typeof FetchWrapper.prototype.performDesktopFetch !== 'function') { desktopReason = 'hook_unavailable'; return; }
    const original = FetchWrapper.prototype.performDesktopFetch;
    FetchWrapper.prototype.performDesktopFetch = function(...args) { return scope.run(true, () => original.apply(this, args)); };
    restores.push(() => { FetchWrapper.prototype.performDesktopFetch = original; });
  }
  Module.prototype._compile = function(code, filename) {
    const name = path.basename(filename);
    if (!Object.hasOwn(expectedHashes, name)) return originalCompile.call(this, code, filename);
    const profile = PROFILES[name] ?? { kind: name.startsWith('bootstrap-') ? 'bootstrap' : name.startsWith('main-') ? 'main' : 'src',
      symbol: name.startsWith('bootstrap-') ? 'Pt' : name.startsWith('main-') ? 'wEe' : 'mQ' };
    const observedSha256 = createHash('sha256').update(code).digest('hex');
    if (observedSha256 !== expectedHashes[name]) {
      if (profile.kind === 'src') taskReason = 'unsupported_build'; else desktopReason = 'unsupported_build';
      mismatch = { name, observedSha256 }; return originalCompile.call(this, code, filename);
    }
    const result = originalCompile.call(this, `${code}\n;Object.defineProperty(module.exports,Symbol.for(${JSON.stringify(String(symbol))}),{value:${profile.symbol},configurable:true});`, filename);
    const captured = this.exports[Symbol.for(String(symbol))]; delete this.exports[Symbol.for(String(symbol))];
    if (profile.kind === 'bootstrap') { bootstrapVerified = true; hookNetwork(captured); }
    else if (profile.kind === 'main') { mainVerified = true; hookFetchWrapper(captured); }
    else { srcVerified = true; hookStdio(captured); hookConnection(this.exports[profile.managerExport ?? 'un']); }
    return result;
  };
  restores.push(() => { if (Module.prototype._compile === wrappedCompile) Module.prototype._compile = originalCompile; });
  const wrappedCompile = Module.prototype._compile;
  const desktopDone = () => desktopReason || bootstrapVerified && mainVerified && fetchInstalled && requestInstalled;
  const taskDone = () => taskReason || !Object.keys(expectedHashes).some(name => name.startsWith('src-')) || srcVerified && stdioInstalled && connectionInstalled;
  return Object.freeze({
    async ready() {
      while (!closed && !(desktopDone() && taskDone()) && Date.now() < deadlineUnixMs - 500) await new Promise(resolve => setTimeout(resolve, 20));
      return this.inspect();
    },
    inspect: () => ({ installed: !closed, available: !desktopReason && bootstrapVerified && mainVerified && fetchInstalled && requestInstalled,
      taskConfigurationAvailable: !taskReason && srcVerified && stdioInstalled && connectionInstalled,
      modules: { bootstrap: bootstrapVerified, main: mainVerified, src: srcVerified, stdio: stdioInstalled, connection: connectionInstalled },
      mismatch,
      reason: desktopReason ?? (bootstrapVerified && mainVerified ? null : 'hook_unavailable'),
      taskConfigurationReason: taskReason ?? (srcVerified && stdioInstalled && connectionInstalled ? null : 'hook_unavailable') }),
    close() { if (closed) return; closed = true; for (const restore of restores.reverse()) restore(); for (const route of taskRoutes) closeRoute(route); taskRoutes.clear(); scope.disable(); },
  });
}
module.exports = { installDesktopPlaintext, routedThreadMessage, reviewedSourceProfiles: PROFILES };
