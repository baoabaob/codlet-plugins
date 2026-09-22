'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const fail = code => Object.assign(new Error(code), { code });

// Native starts ONE owned client with --inspect-brk=127.0.0.1:0 and supplies
// the private debugger URL read from that exact child's stderr. No port scan,
// existing client lookup, saved debugger URL or renderer CDP is accepted.
async function attachElectronTrafficBeforeEntry({ inspectorUrl, expectedPid, executable, configuration, signal, mainSource, WebSocketClass = WebSocket }) {
  const url = new URL(inspectorUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || !/^\/[a-f0-9-]{36}$/u.test(url.pathname)
    || !Number.isSafeInteger(expectedPid) || expectedPid < 1 || !path.isAbsolute(executable)) throw fail('invalid_main_bootstrap');
  if (signal?.aborted) throw fail('main_bootstrap_cancelled');
  const canonical = fs.realpathSync(executable), token = randomBytes(24).toString('hex');
  const source = mainSource ?? fs.readFileSync(path.join(__dirname, 'electron-traffic.cjs'), 'utf8');
  const socket = new WebSocketClass(url.href), pending = new Map(); let sequence = 0, paused, pauseResolve, pauseReject;
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
    if (message.method === 'Debugger.paused') { paused = message.params; pauseResolve(paused); }
    const call = pending.get(message.id); if (!call) return;
    pending.delete(message.id); clearTimeout(call.timer);
    message.error ? call.reject(fail('main_bootstrap_protocol_failed')) : call.resolve(message.result);
  });
  socket.addEventListener('close', stop, { once: true }); socket.addEventListener('error', stop, { once: true });
  const timer = setTimeout(stop, 10000);
  function request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(fail('main_bootstrap_cancelled')); return; }
      const id = ++sequence;
      pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(fail('main_bootstrap_timeout')); }, 5000) });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  try {
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(fail('main_bootstrap_connect_failed')), { once: true }); socket.addEventListener('close', () => reject(fail('main_bootstrap_connect_failed')), { once: true }); });
    await request('Debugger.enable'); await request('Runtime.runIfWaitingForDebugger');
    const frame = (await pause)?.callFrames?.[0]; if (!frame) throw fail('main_bootstrap_not_paused');
    // Bind before injecting any configuration, so a stale/wrong peer never
    // receives the authenticated proxy or the private launch descriptor.
    const identity = await request('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: `({pid:process.pid,executable:require('node:fs').realpathSync(process.execPath),type:process.type,ready:require('electron').app.isReady()})`, returnByValue: true });
    const value = identity.result?.value;
    if (identity.exceptionDetails || value?.pid !== expectedPid || value?.executable !== canonical || value?.type !== 'browser' || value?.ready !== false) throw fail('main_bootstrap_identity_mismatch');
    const expression = `(() => { const module={exports:{}}; ((module,exports,require)=>{${source}\n})(module,module.exports,require); const owned=module.exports.installElectronTraffic(require('electron'),${JSON.stringify(configuration)}); const key=Symbol.for(${JSON.stringify(`codlet.private.main-traffic.${token}`)}); Object.defineProperty(globalThis,key,{value:owned,configurable:true}); return {installed:true,pid:process.pid}; })()`;
    const installed = await request('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression, returnByValue: true });
    if (installed.exceptionDetails || installed.result?.value?.installed !== true || installed.result.value.pid !== expectedPid) throw fail('main_bootstrap_install_failed');
    await request('Debugger.resume');
    const ready = await request('Runtime.evaluate', { expression: `globalThis[Symbol.for(${JSON.stringify(`codlet.private.main-traffic.${token}`)})].ready()`, awaitPromise: true, returnByValue: true });
    if (ready.exceptionDetails || !(ready.result?.value?.configuredSessions > 0)) throw fail('main_bootstrap_session_failed');
    // Detach and close the Node inspector immediately after the handshake.
    await request('Runtime.evaluate', { expression: `setImmediate(()=>require('node:inspector').close()); true`, returnByValue: true });
    return Object.freeze({ installed: true, exactChildVerified: true, configuredSessions: ready.result.value.configuredSessions,
      desktopTrafficVerified: false, reason: 'real_request_acceptance_required' });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); stop(); }
}
module.exports = { attachElectronTrafficBeforeEntry };
