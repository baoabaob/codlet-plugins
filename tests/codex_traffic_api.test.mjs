import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { createCodexTraffic } = createRequire(import.meta.url)('../host/codex-traffic.cjs');
const compatibility = { platform: 'win32', binarySha256: 'bc45017e8239dc150258f69309ced9df6bbcdf5b8e4f346decf780ac0999e226' };
function fixture() {
  const lifetime = new AbortController();
  let registered, native = { available: false, listening: true, attached: false, registered: 0, active: 0, pending: 0 };
  const handle = Object.freeze({ id: 'owned-by-consumer' });
  const context = { signal: lifetime.signal, traffic: { inspect: async () => native, async registerInterceptor(options, handlers) { registered = { options, handlers }; return handle; } } };
  return { context, handle, get registered() { return registered; }, setNative(value) { native = value; }, lifetime };
}
test('public Adapter SDK retains consuming Host authority and filters protocol metadata', async () => {
  const f = fixture(), api = createCodexTraffic(f.context, compatibility), calls = [];
  const handle = await api.registerInterceptor({ id: 'model', kinds: ['model.responses'] }, {
    request(value, context) { calls.push(context.codex); assert.equal(Object.isFrozen(context), true); return { block: true }; },
    response(value, context) { calls.push(context.codex); return { body: 'changed' }; },
    webSocket(value, context) { calls.push(context.codex); return { serverToClient: frame => frame }; },
  });
  assert.equal(handle, f.handle);
  assert.deepEqual(f.registered.options, { id: 'model', origins: ['https://chatgpt.com', 'https://api.openai.com'] });
  const context = { signal: f.lifetime.signal };
  assert.deepEqual(f.registered.handlers.request({ url: 'https://api.openai.com/v1/responses', method: 'POST' }, context), { block: true });
  assert.equal(f.registered.handlers.request({ url: 'https://api.openai.com/attachments', method: 'POST' }, context), undefined);
  assert.equal(f.registered.handlers.request({ url: 'https://chatgpt.com/backend-api/codex/models', method: 'GET' }, context), undefined);
  assert.deepEqual(f.registered.handlers.response({}, { ...context, request: { url: 'https://api.openai.com/v1/responses', method: 'POST' } }), { body: 'changed' });
  assert.equal(typeof f.registered.handlers.webSocket({ url: 'wss://chatgpt.com/backend-api/codex/responses' }, context).serverToClient, 'function');
  assert.equal(calls.length, 3); assert(calls.every(value => value.threadId === null && value.model === null));
});
test('available requires Native attachment and a verified profile; unknown builds cannot register', async () => {
  const f = fixture(), api = createCodexTraffic(f.context, compatibility);
  assert.equal((await api.probe()).available, false);
  f.setNative({ listening: true, attached: true, available: true, active: 0, registered: 1 });
  const status = await api.probe(); assert.equal(status.available, true); assert.equal(status.desktop, false); assert.equal(status.attachments, false); assert.equal(status.officialOAuth, false);
  const unknown = createCodexTraffic(f.context, { platform: 'darwin', binarySha256: 'unknown' });
  assert.equal((await unknown.probe()).available, false);
  await assert.rejects(unknown.registerInterceptor({ id: 'x' }, { request() {} }), { code: 'backend_build_unverified' });
  await assert.rejects(api.registerInterceptor({ id: 'x', origins: ['https://attacker.invalid'] }, { request() {} }), { code: 'invalid_argument' });
  f.lifetime.abort(); await assert.rejects(api.registerInterceptor({ id: 'x' }, { request() {} }), { code: 'host_stopping' });
});
