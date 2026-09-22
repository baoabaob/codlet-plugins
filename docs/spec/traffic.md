# Official traffic Adapter SDK

`host/codex-traffic.cjs` is the Host-side public Adapter module. Bundle it into a consuming plugin's Host entry. It uses **that plugin's** `context.traffic` API: registrations and all data operations retain its Core-authenticated id, generation and grants. It does not forward consumer traffic through an Adapter-owned Host capability or a renderer callback.

The plugin declares `host.process`, `host.network`, `traffic.intercept` and `codlet.core.services@1` at runtime scope. Grant the exact origins `https://chatgpt.com` and `https://api.openai.com`. Reading or changing sensitive headers additionally requires `traffic.sensitiveHeaders`; cross-origin changes additionally require `traffic.redirect` and a grant for the destination. The SDK never expands these grants.

```js
const { createCodexTraffic } = require('./codex-traffic.cjs');
exports.activate = async context => {
  // Obtain this build identity from the launch compatibility check; never guess
  // it from the current Desktop window or a model name.
  const api = createCodexTraffic(context, verifiedBackendIdentity);
  const handle = await api.registerInterceptor({ id: 'responses', kinds: ['model.responses'] }, {
    request(request, { codex, signal }) {
      // Returning undefined observes metadata without consuming the one-shot body.
      // codex.threadId and codex.model remain null until correlation is verified.
    },
    webSocket(request, { codex, signal }) {
      return { serverToClient: frame => frame };
    }
  });
  // Await handle.setEnabled(false), handle.close() or handle.dispose() as needed.
};
```

The public methods are `probe`, `registerInterceptor`, `classify`, `readJsonBody` and `rewriteJsonBody`. Options select `model.responses` and/or `model.list`; the SDK owns endpoint matching. Unknown paths, attachment endpoints and unverified domains do not invoke its callbacks. Registering an origin still permits Core to terminate TLS for that origin; this endpoint classifier is a semantic filter, not a path-level TLS boundary.

HTTP and WebSocket callbacks receive raw Core transport values plus frozen `context.codex` metadata. JSON decoding is explicit because bodies are one-shot streams. `readJsonBody` bounds both compressed and decoded data and supports identity, gzip, deflate, Brotli and Zstandard. `rewriteJsonBody` removes stale content-encoding, length and digest headers. It does not parse SSE chunks as complete events, infer task associations, retry requests, reconnect or rewrite providers.

`probe().available` requires both the verified backend profile and Native `attached && available`. A listening worker alone is insufficient. Registration may occur while Native is listening but before the official child is attached, so launch can install hooks before first traffic. Coverage is registered backend origins only; Desktop, attachments, existing loaded threads and official OAuth are not promoted by a fixture hash. Those require the separate real-client acceptance evidence.

The existing renderer `codex.backend.transport@1` / `registerThreadTransport` API remains an explicit channel selection mechanism at thread start/resume. It is distinct from this Host registration API and does not establish transparent process coverage.

Native launch integration must preserve the original route and CA precedence (`CODEX_CA_CERTIFICATE`, then `SSL_CERT_FILE`), keep gateway proxy/trust out of tool subprocess environments, own the gateway process tree, wait for its launch descriptor and retire its temporary trust files on all exits. The Core worker emits `{proxyUrl, bundlePath}` over its authenticated gateway connection; no proxy password or private CA material belongs in status output.
