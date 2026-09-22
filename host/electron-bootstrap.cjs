'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const fail = code => Object.assign(new Error(code), { code });
function diagnosticSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000) : 0;
  const code = value => typeof value === 'string' && /^[a-z_]{1,80}$/u.test(value) ? value : null;
  const result = { installed: value.installed === true, available: value.available === true, configuredSessions: count(value.configuredSessions), reason: code(value.reason) };
  if (value.backend) result.backend = Object.fromEntries(['backendRootsPrepared', 'backendRootsDeclined', 'codeModeSidecars', 'mcpWrappers'].map(key => [key, count(value.backend[key])]));
  if (value.apiNames && typeof value.apiNames === 'object') {
    const names = values => Array.isArray(values) ? values.filter(name => typeof name === 'string' && name.length <= 128).slice(0, 150) : [];
    result.apiNames = { exports: names(value.apiNames.exports) };
    for (const key of ['app', 'session', 'net', 'applicationNetwork']) result.apiNames[key] = { own: names(value.apiNames[key]?.own), prototype: names(value.apiNames[key]?.prototype) };
  }
  return result;
}

// Native starts ONE owned client with --inspect-brk=127.0.0.1:0 and supplies
// the private debugger URL read from that exact child's stderr. No port scan,
// existing client lookup, saved debugger URL or renderer CDP is accepted.
async function attachElectronTrafficBeforeEntry({ inspectorUrl, expectedPid, executable, configuration, signal, mainSource, WebSocketClass = WebSocket }) {
  const url = new URL(inspectorUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || !/^\/[a-f0-9-]{36}$/u.test(url.pathname)
    || !Number.isSafeInteger(expectedPid) || expectedPid < 1 || !path.isAbsolute(executable)) throw fail('invalid_main_bootstrap');
  if (signal?.aborted) throw fail('main_bootstrap_cancelled');
  const deadlineUnixMs = Date.now() + 10000;
  const canonical = fs.realpathSync(executable), token = randomBytes(24).toString('hex');
  const source = mainSource ?? fs.readFileSync(path.join(__dirname, 'electron-traffic.cjs'), 'utf8');
  const socket = new WebSocketClass(url.href), pending = new Map(); let sequence = 0, paused, pauseResolve, pauseReject, stage = 'connect';
  const pauseReasons = [], timings = [];
  const pause = new Promise((resolve, reject) => { pauseResolve = resolve; pauseReject = reject; });
  pause.catch(() => {});
  const stop = () => {
    const error = fail('main_bootstrap_cancelled');
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear(); pauseReject(error); socket.close();
  };
  signal?.addEventListener('abort', stop, { once: true });
  socket.addEventListener('message', event => {
    let message; try { message = JSON.parse(event.data); } catch { stop(); return; }
    if (message.method === 'Debugger.paused') { paused = message.params; pauseReasons.push(typeof paused?.reason === 'string' ? paused.reason.slice(0, 80) : 'unknown'); if (pauseReasons.length > 16) pauseReasons.shift(); pauseResolve(paused); }
    const call = pending.get(message.id); if (!call) return;
    pending.delete(message.id); clearTimeout(call.timer);
    timings.push({ method: call.method, ms: Date.now() - call.started });
    if (timings.length > 24) timings.shift();
    message.error ? call.reject(fail('main_bootstrap_protocol_failed')) : call.resolve(message.result);
  });
  socket.addEventListener('close', stop, { once: true }); socket.addEventListener('error', stop, { once: true });
  const timer = setTimeout(stop, Math.max(1, deadlineUnixMs - Date.now()));
  function request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(fail('main_bootstrap_cancelled')); return; }
      const remaining = deadlineUnixMs - Date.now();
      if (remaining <= 0 || socket.readyState !== 1) { reject(fail('main_bootstrap_timeout')); return; }
      const id = ++sequence;
      pending.set(id, { resolve, reject, method, started: Date.now(), timer: setTimeout(() => { pending.delete(id); reject(Object.assign(fail('main_bootstrap_timeout'), { details: { stage, method } })); }, stage === 'ready' ? remaining : Math.min(5000, remaining)) });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  try {
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(fail('main_bootstrap_connect_failed')), { once: true }); socket.addEventListener('close', () => reject(fail('main_bootstrap_connect_failed')), { once: true }); });
    stage = 'pause'; await request('Debugger.enable'); await request('Runtime.runIfWaitingForDebugger');
    const frame = (await pause)?.callFrames?.[0]; if (!frame) throw fail('main_bootstrap_not_paused');
    // Bind before injecting any configuration, so a stale/wrong peer never
    // receives the authenticated proxy or the private launch descriptor.
    stage = 'identity';
    const identity = await request('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: `({pid:process.pid,executable:require('node:fs').realpathSync(process.execPath),type:process.type,ready:require('electron').app.isReady(),electronVersion:process.versions.electron,chromeVersion:process.versions.chrome,nodeVersion:process.versions.node})`, returnByValue: true });
    const value = identity.result?.value;
    if (identity.exceptionDetails || value?.pid !== expectedPid || value?.executable !== canonical || value?.type !== 'browser' || value?.ready !== false) throw fail('main_bootstrap_identity_mismatch');
    const expression = `(() => { const module={exports:{}}; ((module,exports,require)=>{${source}\n})(module,module.exports,require); const owned=module.exports.installElectronTraffic(require('electron'),${JSON.stringify({ ...configuration, deadlineUnixMs })}); const key=Symbol.for(${JSON.stringify(`codlet.private.main-traffic.${token}`)}); Object.defineProperty(globalThis,key,{value:{ready:()=>owned.ready(),inspect:()=>owned.inspect(),closeInspector:()=>{setImmediate(()=>require('node:inspector').close());return true}},configurable:true}); return {installed:true,pid:process.pid}; })()`;
    stage = 'install';
    const installed = await request('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression, returnByValue: true });
    if (installed.exceptionDetails || installed.result?.value?.installed !== true || installed.result.value.pid !== expectedPid) throw fail('main_bootstrap_install_failed');
    stage = 'resume'; await request('Debugger.resume');
    stage = 'ready';
    let ready;
    try {
      const resultKey = JSON.stringify(`codlet.private.main-traffic-result.${token}`);
      await request('Runtime.evaluate', { expression: `(() => { const key=Symbol.for(${resultKey}); globalThis[key]={pending:true}; globalThis[Symbol.for(${JSON.stringify(`codlet.private.main-traffic.${token}`)})].ready().then(value=>{globalThis[key]={value}},error=>{globalThis[key]={error:/^[a-z_]{1,80}$/.test(error?.code)?error.code:'main_bootstrap_session_failed'}}); return true; })()`, returnByValue: true });
      while (true) {
        const receipt = await request('Runtime.evaluate', { expression: `globalThis[Symbol.for(${resultKey})]`, returnByValue: true });
        const result = receipt.result?.value;
        if (receipt.exceptionDetails || result?.error) throw fail(result?.error ?? 'main_bootstrap_session_failed');
        if (result?.value) { ready = { result: { value: result.value } }; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await request('Runtime.evaluate', { expression: `delete globalThis[Symbol.for(${resultKey})]`, returnByValue: true });
    }
    catch (error) {
      const status = await request('Runtime.evaluate', { expression: `globalThis[Symbol.for(${JSON.stringify(`codlet.private.main-traffic.${token}`)})].inspect()`, returnByValue: true }).catch(() => null);
      error.details = { stage, ...(error.details ?? {}), runtime: { electron: value.electronVersion, chrome: value.chromeVersion, node: value.nodeVersion }, owned: diagnosticSnapshot(status?.result?.value), pauseReasons, timings: timings.slice(-12) }; throw error;
    }
    if (ready.exceptionDetails || !(ready.result?.value?.configuredSessions > 0)) throw fail('main_bootstrap_session_failed');
    // Detach and close the Node inspector immediately after the handshake.
    stage = 'detach';
    const detached = await request('Runtime.evaluate', { expression: `globalThis[Symbol.for(${JSON.stringify(`codlet.private.main-traffic.${token}`)})].closeInspector()`, returnByValue: true });
    if (detached.exceptionDetails || detached.result?.value !== true) throw fail('main_bootstrap_detach_failed');
    return Object.freeze({ installed: true, exactChildVerified: true, configuredSessions: ready.result.value.configuredSessions,
      runtime: { electron: value.electronVersion, chrome: value.chromeVersion, node: value.nodeVersion },
      backendRootsPrepared: ready.result.value.backend?.backendRootsPrepared ?? 0,
      backendRootsDeclined: ready.result.value.backend?.backendRootsDeclined ?? 0,
      ...(ready.result.value.acceptance ? { acceptance: ready.result.value.acceptance } : {}),
      desktopTrafficVerified: false, reason: 'real_request_acceptance_required' });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); stop(); }
}
module.exports = { attachElectronTrafficBeforeEntry };
