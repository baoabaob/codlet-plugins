'use strict';
const { X509Certificate } = require('node:crypto');
const net = require('node:net');
const fail = code => Object.assign(new Error(code), { code });

// Fixed Adapter main-process entry, installed before application entry executes.
// Never load from a renderer or substitute --ignore-certificate-errors.
function installElectronTraffic({ app, session }, { proxyUrl, caPem, originalProxy = { mode: 'system' } }) {
  if (!app || !session || app.isReady()) throw fail('electron_bootstrap_too_late');
  const proxy = new URL(proxyUrl);
  if (proxy.protocol !== 'http:' || proxy.hostname !== '127.0.0.1' || !proxy.port || !proxy.username || !proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash) throw fail('invalid_process_proxy');
  const ca = new X509Certificate(caPem);
  if (!ca.ca || !ca.verify(ca.publicKey)) throw fail('invalid_launch_ca');
  const states = new Map(); let closed = false, failure = null;
  const inDate = cert => Date.parse(cert.validFrom) <= Date.now() && Date.now() < Date.parse(cert.validTo);
  if (!inDate(ca)) throw fail('invalid_launch_ca');
  function verify(request, callback) {
    if (closed) { callback(-3); return; }
    try {
      const leaf = new X509Certificate(request.certificate.data);
      const host = request.hostname.replace(/^\[|\]$/gu, '');
      const matches = net.isIP(host) ? leaf.checkIP(host) : leaf.checkHost(host, { subject: 'never', wildcards: false });
      if (!leaf.ca && leaf.keyUsage?.includes('1.3.6.1.5.5.7.3.1') && inDate(ca) && inDate(leaf) && matches && leaf.checkIssued(ca) && leaf.verify(ca.publicKey)) { callback(0); return; }
    } catch {}
    // All other certificates retain Chromium's normal system/corporate trust.
    callback(-3);
  }
  function login(event, _contents, _details, auth, callback) {
    if (closed || !auth?.isProxy || auth.host !== proxy.hostname || Number(auth.port) !== Number(proxy.port)) return;
    event.preventDefault(); callback(decodeURIComponent(proxy.username), decodeURIComponent(proxy.password));
  }
  function attach(value) {
    if (closed || states.has(value)) return;
    if (states.size >= 32) { failure = 'electron_session_limit'; return; }
    const state = { applied: false, pending: null }; states.set(value, state);
    value.setCertificateVerifyProc(verify);
    state.pending = Promise.resolve(value.setProxy({ mode: 'fixed_servers', proxyRules: `http=${proxy.host};https=${proxy.host}`, proxyBypassRules: '<-loopback>' }))
      .then(() => { state.applied = !closed; }, () => { failure = 'electron_proxy_failed'; });
  }
  // The owner must also supply --proxy-server before Chromium starts. setProxy
  // completion alone cannot prevent an app's earlier ready listener from sending.
  app.on('session-created', attach); app.on('login', login);
  const ready = () => attach(session.defaultSession);
  app.once('ready', ready);
  async function close() {
    if (closed) return; closed = true;
    app.removeListener('session-created', attach); app.removeListener('login', login); app.removeListener('ready', ready);
    for (const [value, state] of states) {
      await state.pending;
      value.setCertificateVerifyProc(null);
      await value.setProxy(originalProxy);
      await value.closeAllConnections();
    }
    states.clear();
  }
  return Object.freeze({ close,
    async ready() { if (!app.isReady()) await app.whenReady(); ready(); await Promise.all([...states.values()].map(value => value.pending)); if (failure) throw fail(failure); return this.inspect(); },
    inspect: () => Object.freeze({ installed: !closed, configuredSessions: [...states.values()].filter(value => value.applied).length,
      // Only the Native verified bootstrap handshake can establish full coverage.
      available: false, reason: failure ?? 'main_process_bootstrap_acceptance_required' }),
  });
}
module.exports = { installElectronTraffic };
