import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const { installElectronTraffic } = createRequire(import.meta.url)('../host/electron-traffic.cjs');
const fixtures = new URL('./fixtures/traffic/', import.meta.url);
const [caPem, cert, unrelated] = await Promise.all(['ca.pem', 'cert.pem', 'unrelated-cert.pem'].map(name => fs.readFile(new URL(name, fixtures), 'utf8')));
const configuration = { proxyUrl: 'http://codlet:fixture@127.0.0.1:12345', caPem };
function fixture() {
  const app = new EventEmitter(); app.started = false; app.isReady = () => app.started;
  app.whenReady = () => app.started ? Promise.resolve() : new Promise(resolve => app.once('ready', resolve));
  const proxies = []; let verify;
  const session = { defaultSession: { setCertificateVerifyProc(value) { verify = value; }, async setProxy(value) { proxies.push(value); }, async closeAllConnections() {} } };
  return { app, session, proxies, get verify() { return verify; }, start() { app.started = true; app.emit('ready'); } };
}
test('Session trust only overrides authority errors for the exact launch CA, name, EKU and dates', async () => {
  const f = fixture(), hook = installElectronTraffic(f, configuration);
  f.app.emit('session-created', {}, f.session.defaultSession); f.start(); await hook.ready();
  const checked = (hostname, data = cert, errorCode = -202) => new Promise(resolve => f.verify({ hostname, certificate: { data }, errorCode }, resolve));
  assert.equal(await checked('codlet-probe.invalid'), 0);
  for (const code of [-200, -201, -206, -208, -214, 0]) assert.equal(await checked('codlet-probe.invalid', cert, code), -3);
  for (const [errorCode, verificationResult] of [[-201, 'CERT_AUTHORITY_INVALID'], [-202, 'CERT_REVOKED'], [-202, 'net::ERR_CERT_DATE_INVALID']]) {
    assert.equal(await new Promise(resolve => f.verify({ hostname: 'codlet-probe.invalid', certificate: { data: cert }, errorCode, verificationResult }, resolve)), -3);
  }
  for (const [hostname, value] of [['wrong.invalid', cert], ['localhost', unrelated], ['localhost', caPem], ['localhost', 'invalid']]) assert.equal(await checked(hostname, value), -3);
  const originalNow = Date.now; Date.now = () => 4102444800000;
  try { assert.equal(await checked('codlet-probe.invalid'), -3); } finally { Date.now = originalNow; }
  await hook.close(); assert.equal(f.verify, null); assert.equal(f.app.listenerCount('session-created'), 0);
});
test('real fork Session shape fails closed even with app.setProxy, without installing global fallbacks', async () => {
  const f = fixture(); let globalProxy = 0;
  f.app.setProxy = async () => { globalProxy++; };
  f.session.defaultSession = { cookies: {}, protocol: {}, webRequest: {}, fetch() {} };
  const request = () => {}; f.net = { request };
  const hook = installElectronTraffic(f, configuration);
  f.app.emit('session-created', f.session.defaultSession); f.start();
  await assert.rejects(hook.ready(), { code: 'electron_transport_unverified' });
  assert.equal(hook.inspect().configuredSessions, 0); assert.equal(globalProxy, 0);
  assert.equal(f.net.request, request); assert.equal(f.app.listenerCount('certificate-error'), 0);
  await hook.close();
});
test('proxy setup failure rejects readiness; newly created sessions cannot silently share an unverified route', async () => {
  const f = fixture(), hook = installElectronTraffic(f, configuration);
  f.app.emit('session-created', f.session.defaultSession);
  const second = { setCertificateVerifyProc() {}, async setProxy() { throw new Error('failure'); }, async closeAllConnections() {} };
  f.app.emit('session-created', {}, second); f.start();
  await assert.rejects(hook.ready(), { code: 'electron_proxy_failed' });
  assert.equal(hook.inspect().configuredSessions, 1); assert.equal(hook.inspect().available, false);
  await hook.close().catch(() => {});
});
