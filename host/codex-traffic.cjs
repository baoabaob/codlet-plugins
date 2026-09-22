'use strict';
// Official Adapter-owned protocol/launch knowledge. Core has no Codex names.
// Native owns launch attachment. The public SDK registers with the consuming
// Host context, so the Adapter cannot lend its own permissions to other plugins.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const zlib = require('node:zlib');
const failure = code => Object.assign(new Error(code), { code });
const VERIFIED_BACKENDS = Object.freeze({
  win32: Object.freeze({ sha256: 'bc45017e8239dc150258f69309ced9df6bbcdf5b8e4f346decf780ac0999e226', version: '0.155.0-alpha.9.2', evidence: 'controlled-custom-provider-no-oauth' }),
});
function probeCodexTraffic({ platform = process.platform, binarySha256 } = {}) {
  const backend = VERIFIED_BACKENDS[platform];
  const fixtureVerified = !!backend && binarySha256?.toLowerCase() === backend.sha256;
  return Object.freeze({ available: false, fixtureVerified, restartRequired: true, officialOAuth: false, existingLoadedThreads: false, desktop: false, attachments: false,
    fixtureProtocols: fixtureVerified ? ['http', 'https', 'sse', 'ws', 'wss'] : [],
    reason: fixtureVerified ? 'native_process_ingress_not_attached' : 'backend_build_unverified' });
}
async function prepareCodexBackendTraffic({ core, executable, platform = process.platform, environment, directory, proxyUrl, additionalCaPem, systemProxyFeature = null }) {
  if (!path.isAbsolute(executable) || !core?.prepareProcessTrafficEnvironment) throw failure('invalid_backend_launch');
  if (systemProxyFeature === true) throw failure('backend_proxy_policy_unverified');
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(executable)) hash.update(chunk);
  const sha256 = hash.digest('hex');
  if (!VERIFIED_BACKENDS[platform] || VERIFIED_BACKENDS[platform].sha256 !== sha256) throw failure('backend_build_unverified');
  const get = name => {
    const key = Object.keys(environment).find(key => platform === 'win32' ? key.toUpperCase() === name : key === name);
    return key ? environment[key] : undefined;
  };
  // Preserve official trust precedence. An empty explicit override is invalid;
  // silently replacing it could make a previously rejected route trusted.
  const prior = get('CODEX_CA_CERTIFICATE') ?? get('SSL_CERT_FILE');
  if (prior !== undefined && !prior) throw failure('invalid_existing_trust');
  const prepared = await core.prepareProcessTrafficEnvironment({ platform, environment, directory, proxyUrl, additionalCaPem, trustInputs: prior === undefined ? [] : [prior], trustOutputs: ['CODEX_CA_CERTIFICATE'] });
  return Object.freeze({ ...prepared, probe: () => probeCodexTraffic({ platform, binarySha256: sha256 }) });
}
function classifyCodexTraffic({ url, method }) {
  let target; try { target = new URL(url); } catch { return Object.freeze({ kind: 'unknown', threadId: null, model: null }); }
  const protocol = target.protocol === 'wss:' ? 'https:' : target.protocol === 'ws:' ? 'http:' : target.protocol;
  const trusted = protocol === 'https:' && !target.username && !target.password && !target.port;
  let kind = 'unknown';
  if (trusted && (target.hostname === 'chatgpt.com' && target.pathname === '/backend-api/codex/responses' || target.hostname === 'api.openai.com' && target.pathname === '/v1/responses') && ['POST', 'GET'].includes(method)) kind = 'model.responses';
  if (trusted && target.hostname === 'chatgpt.com' && target.pathname === '/backend-api/codex/models' && method === 'GET') kind = 'model.list';
  // Correlation requires separate verified protocol evidence. Never infer thread
  // IDs from a URL query, timing, whichever task is visible, or a model name.
  return Object.freeze({ kind, threadId: null, model: null });
}
async function readCodexJsonBody(request, maximum = 8 * 1024 * 1024) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 8 * 1024 * 1024) throw failure('invalid_body_limit');
  const chunks = []; let bytes = 0;
  for await (const chunk of request.body) { bytes += chunk.length; if (bytes > maximum) throw failure('codex_body_too_large'); chunks.push(Buffer.from(chunk)); }
  const encodings = request.headers.filter(([name]) => name.toLowerCase() === 'content-encoding').map(([, value]) => value.toLowerCase().trim());
  if (encodings.length > 1) throw failure('codex_encoding_unsupported');
  const encoding = encodings[0] ?? 'identity';
  const decoder = { gzip: zlib.gunzipSync, br: zlib.brotliDecompressSync, deflate: zlib.inflateSync, zstd: zlib.zstdDecompressSync }[encoding];
  if (encoding !== 'identity' && !decoder) throw failure('codex_encoding_unsupported');
  try { const raw = Buffer.concat(chunks); return JSON.parse(decoder ? decoder(raw, { maxOutputLength: maximum }) : raw); }
  catch { throw failure('codex_body_invalid'); }
}
function rewrittenCodexJsonBody(request, value) {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw failure('codex_body_too_large');
  return { body, headers: request.headers.filter(([name]) => !['content-encoding', 'content-length', 'content-md5', 'content-digest', 'digest'].includes(name.toLowerCase())) };
}
function createCodexTraffic(context, compatibility = {}) {
  if (!context?.traffic?.registerInterceptor || !context.traffic.inspect || !context.signal) throw failure('core_traffic_unavailable');
  const verified = probeCodexTraffic(compatibility);
  async function probe() {
    let native;
    try { native = await context.traffic.inspect(); }
    catch (error) {
      if (!['traffic_unavailable', 'permission_denied', 'capability_unavailable', 'host_stopping', 'authorization_revoked'].includes(error.code)) throw failure('core_traffic_unavailable');
      return Object.freeze({ ...verified, listening: false, attached: false, reason: verified.fixtureVerified ? error.code : verified.reason });
    }
    const attached = native.attached === true && native.available === true;
    return Object.freeze({ ...verified, available: verified.fixtureVerified && attached, listening: native.listening === true, attached,
      restartRequired: !attached, reason: !verified.fixtureVerified ? verified.reason : attached ? null : 'native_process_ingress_not_attached',
      coverage: 'registered-backend-origins', registered: native.registered, active: native.active });
  }
  async function registerInterceptor(options, handlers) {
    if (context.signal.aborted) throw failure('host_stopping');
    if (!verified.fixtureVerified) throw failure('backend_build_unverified');
    if (!options || typeof options !== 'object' || Object.keys(options).some(key => !['id', 'priority', 'timeoutMs', 'kinds'].includes(key))) throw failure('invalid_argument');
    const kinds = options.kinds ?? ['model.responses', 'model.list'];
    if (!Array.isArray(kinds) || !kinds.length || kinds.length > 2 || new Set(kinds).size !== kinds.length || kinds.some(kind => !['model.responses', 'model.list'].includes(kind))) throw failure('invalid_argument');
    if (!handlers || typeof handlers !== 'object' || !Object.keys(handlers).length || Object.entries(handlers).some(([key, value]) => !['request', 'response', 'webSocket'].includes(key) || typeof value !== 'function')) throw failure('invalid_handler');
    const wrapped = {};
    const metadata = value => { const info = classifyCodexTraffic(value); return kinds.includes(info.kind) ? info : null; };
    if (handlers.request) wrapped.request = (value, call) => {
      const codex = metadata(value); return codex ? handlers.request(value, Object.freeze({ ...call, codex })) : undefined;
    };
    if (handlers.response) wrapped.response = (value, call) => {
      const codex = metadata(call.request); return codex ? handlers.response(value, Object.freeze({ ...call, codex })) : undefined;
    };
    if (handlers.webSocket) wrapped.webSocket = (value, call) => {
      const codex = metadata({ ...value, method: 'GET' }); return codex ? handlers.webSocket(value, Object.freeze({ ...call, codex })) : undefined;
    };
    const { kinds: ignored, ...registration } = options;
    return context.traffic.registerInterceptor({ ...registration, origins: ['https://chatgpt.com', 'https://api.openai.com'] }, wrapped);
  }
  return Object.freeze({ probe, registerInterceptor, classify: classifyCodexTraffic, readJsonBody: readCodexJsonBody, rewriteJsonBody: rewrittenCodexJsonBody });
}
module.exports = { createCodexTraffic, probeCodexTraffic, prepareCodexBackendTraffic, classifyCodexTraffic, readCodexJsonBody, rewrittenCodexJsonBody };
