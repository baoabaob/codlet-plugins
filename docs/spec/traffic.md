# Official traffic Adapter contract

## Scope and evidence

The reviewed Windows Desktop packages `26.915.4065.0` and `26.917.6896.0` run Owl main processes. The official Adapter uses a pre-entry hook in one newly owned, identity-checked process. It never edits the installed archive. Their verified `performDesktopFetch` paths reach `ApplicationNetwork.fetch` and the upload-progress `request` branch after the official auth, workspace policy and cancellation decisions. Both paths dispatch through the original `ApplicationNetwork.request`, retaining Electron's Chromium session, cookies, proxy, TLS and cancellation behavior. Core intercepts the initial dispatched request and the final response. Native redirect events identify the actual final URL and synchronously recheck each destination against the official Desktop policy; Core authorizes the final response callback against that URL's origin. Electron does not expose intermediate 302 response bodies to this path, so intermediate responses and redirected request hops cannot be read or rewritten by plugins. A plugin-requested cross-origin rewrite omits ambient session credentials for its whole native redirect chain.

The exact reviewed main, bootstrap and `src` module hashes are checked before their private classes are patched. A changed build disables that source. Desktop coverage is limited to those main-process HTTP/SSE calls. Browser pages, remote/cloud backends, attachments, Realtime/WebRTC and macOS have no claimed coverage.

The reviewed local `codex.exe` profiles are `0.155.0-alpha.9.2` (SHA-256 `bc45017e8239dc150258f69309ced9df6bbcdf5b8e4f346decf780ac0999e226`) and `0.155.0-alpha.16` (SHA-256 `97d4d67419d0ac2f71342f9a5e850f9468aa622618de8ea823223edb9a91926a`). Their Responses HTTP/SSE and WebSocket model traffic is routed through Core's private plaintext source endpoint by process-local provider config overrides. This is an explicit endpoint route; it does not hook encrypted sockets in the backend. The original effective model, provider, auth store and environment remain in place. A read-only probe projects only provider base URLs and account type. The exact owned app-server child receives the overrides; unrelated children and normal launches are unchanged. Existing `CODEX_CA_CERTIFICATE` or `SSL_CERT_FILE` is read as bounded PEM and attached to the exact upstream route, alongside normal trust roots. Core pins the old route and trust to active exchanges during an update.

The reviewed backend uses `openai_base_url` for built-in inference, including ChatGPT auth, and `model_providers.<id>.base_url` for custom Responses providers. Its `chatgpt_base_url` setting is a separate backend service endpoint. When a local account update changes API-key versus ChatGPT mode, the Adapter updates the built-in route before later Stdio sends. The verified local Stdio hook also rewrites task-local provider base URLs at `thread/start` and `thread/resume`, covering both renderer and internal requests. If route registration fails, that request receives an error and the original external base URL is never sent. Existing configured provider selection is unchanged when the task supplies no new base URL.

The [request-chain research](request-chain.md) records the installed call sites and controlled six-mode backend experiment. Synthetic tests covered custom, built-in API-key and ChatGPT auth; HTTP, SSE and WS; Zstandard ChatGPT bodies; WS prewarm and continuation; cancellation; and two concurrent task IDs. These fixtures do not establish live login refresh or universal client networking.

The official Apple Silicon [Sparkle appcast](https://persistent.oaistatic.com/codex-app-prod/appcast.xml) lists a versioned, signed ChatGPT `26.917.62051` ZIP (build `10789`). Its arm64 `codex` contains version string `0.155.0-alpha.16.3`; the exact bundle and Owl module hashes are recorded in [`mac-plaintext-candidate.json`](../../tests/fixtures/traffic/mac-plaintext-candidate.json). Static review found `ApplicationNetwork.fetch/request`, `performDesktopFetch` and the owned Stdio send path with the same integration points as the Windows source. The candidate remains outside production `PROFILES` and `VERIFIED_BACKENDS` until controlled Apple Silicon HTTP/SSE/WS and exact-owned main-process acceptance passes. The earlier Mac `26.917.61114` backend passed eight native synthetic cases, but its Desktop acceptance was blocked by a fixture build-flavor error; that evidence does not verify this newer build.

## Host registration SDK

Bundle `host/codex-traffic.cjs` into the consuming plugin's Host entry and call `createCodexTraffic(context, compatibility)`. Registrations use that plugin's own `context.traffic` grants. Exact origins, `traffic.intercept`, and any plugin-requested `traffic.redirect` destination grant remain Core decisions. `traffic.sensitiveHeaders` is required before a callback can see `x-client-request-id`; otherwise `context.codex.threadId` is null. On the verified backend's Responses HTTP requests and WS handshakes, a single well-formed value maps to the task ID; ambiguous or missing values stay null. The Adapter does not lend its own launch authority to consumers.

```js
const { createCodexTraffic } = require('./codex-traffic.cjs');
exports.activate = async context => {
  const api = createCodexTraffic(context, verifiedBackendIdentity);
  const handle = await api.registerInterceptor({ id: 'responses', kinds: ['model.responses'], origins: ['https://api.openai.com'] }, {
    request(request, { codex, signal }) {
      // undefined leaves this one-shot request stream unchanged.
    }
  });
  // Await handle.setEnabled(false), handle.close() or handle.dispose().
};
```

The SDK filters `model.responses` and `model.list` paths within the declared origins. It explicitly decodes bounded JSON for identity, gzip, deflate, Brotli and Zstandard, and removes stale content length/encoding/digest headers on a rewrite. SSE byte chunks are not assumed to be whole events. The SDK does not replay non-idempotent requests or move server-owned WS continuation state between providers. `probe().available` requires both the reviewed backend build and Native's `owned-backend-provider` activation; Desktop-only activation is insufficient.

The renderer `codex.backend.write@1` / `registerThreadConfiguration` callback changes task-local model/provider configuration at thread start/resume, and can select a model for each `turn.start` when explicitly registered for that phase. Provider changes are rejected at turn start. A newly created provider uses a private loopback base URL. The ordinary Core channel API remains available, including when no traffic source is requested. Registering task configuration alone does not activate transparent source coverage.

## Launch and readiness

The Desktop Adapter's Host provides `codlet.client.launch@1/runtime`; it requests `host.process` and `cdp.raw` but no `traffic.intercept`. `prepareClientLaunch` accepts Core's private plaintext source descriptor and adds only `--inspect-brk=127.0.0.1:0`. `attachClientLaunch` verifies the paused child's PID, canonical executable, browser type and pre-ready state before injecting the bundled main hook or source token. It resumes, waits on the single launch deadline, closes the inspector and returns exact `activatedSources` and `unsupportedSources` entries. Native attaches only declared active coverage and fails a requested traffic launch closed if every source is unavailable. Ordinary launches with no traffic consumer do not use this hook.

The retired CONNECT proxy, forged launch CA, Session proxy/certificate verifier, code-mode sidecar and MCP environment wrappers are absent from production. Parent, tool and MCP process environments retain the official values. The new private provider route forwards HTTP/SSE and WS with cancellation and bounded bodies/frames; it does not disable TLS verification.

## Developer checks

`tests/electron_plaintext.test.mjs` verifies the scoped Desktop fetch and progress branches, native redirect final URL tracking, cross-origin ambient credentials and the exact-owned Stdio task rewrite. `tests/backend_spawn.test.mjs` verifies effective provider routes, owned-child selection, unchanged environment, account route update and scoped CA input. `tests/electron_bootstrap_protocol.test.mjs` exercises the real Node inspector handshake; it is not an official Desktop acceptance substitute. The opt-in owned drivers under `scripts/verify-plaintext-*.mjs` exercise controlled official binaries without modifying installed files. On Apple Silicon, `scripts/verify-plaintext-backend.mjs` requires the explicit candidate hash and `scripts/verify-official-main-owned.mjs --mac-candidate yes` compiles a private test-only Host bundle; neither action promotes a production profile.
