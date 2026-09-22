# Official traffic Adapter contract

## Current supported scope

**Transparent Desktop launch is unavailable on Windows package `26.915.4065.0`.** Its real owned process reports Electron/Chrome `153.0.8010.48`, Node `24.19.0`. Its Session exposes neither `setProxy` nor `setCertificateVerifyProc`. The production adapter returns `electron_transport_unverified`; Native must reap only the attempted owned launch and must not mark traffic attached. Normal launches without an enabled, granted traffic consumer do not invoke this provider.

The real pre-entry inspector handshake, identity checks and backend environment preparation were exercised successfully. That is not network interception acceptance. In isolated, no-account experiments, `net.fetch` and `session.fetch` returned HTTP 407; browser navigation returned `ERR_INVALID_AUTH_CREDENTIALS`; WS/WSS did not reach the handlers. A scoped `net.request` experiment was invoked 14 times but observed zero login events. Application-level proxy and certificate-error fallbacks were removed from production. No unauthenticated proxy, installed CA, global TLS bypass or request-header credential workaround is provided.

Evidence is in local `.artifacts/official-main-owned-result.json` and `.artifacts/official-main-apis.json` (bounded runtime version, field names, counters and cleanup results). These are development artifacts, not package payloads. The owned tests used fresh `CODEX_HOME`, user-data, HOME/APPDATA/LOCALAPPDATA and no copied credentials. Only local fixtures could be forwarded. Final cleanup verifies original client identities, reaps the new process tree by PID plus creation time, and removes the exact private directory without `-Force`.

## Host registration SDK

Bundle `host/codex-traffic.cjs` into the consuming plugin's Host entry and call `createCodexTraffic(context, compatibility)`. Its public methods are `probe`, `registerInterceptor`, `classify`, `readJsonBody` and `rewriteJsonBody`. All registrations use the **consumer's own** `context.traffic`; Adapter permissions are never lent through another Host or renderer capability.

Declare and grant `host.process`, `host.network`, `traffic.intercept` and the runtime `codlet.core.services@1` requirement, with exact origins `https://chatgpt.com` and `https://api.openai.com`. Sensitive headers require `traffic.sensitiveHeaders`; cross-origin rewrites require `traffic.redirect` and the destination origin grant.

```js
const { createCodexTraffic } = require('./codex-traffic.cjs');
exports.activate = async context => {
  const api = createCodexTraffic(context, verifiedBackendIdentity);
  const handle = await api.registerInterceptor({ id: 'responses', kinds: ['model.responses'] }, {
    request(request, { codex, signal }) {
      // undefined leaves the request unchanged; its body is a one-shot stream.
    }
  });
  // Await handle.setEnabled(false), handle.close() or handle.dispose().
};
```

Kinds select `model.responses` and/or `model.list`. The SDK filters verified endpoints, excludes unknown/attachment paths and leaves `threadId`/`model` null until correlation is independently established. This semantic path filter is not a TLS path boundary: TLS interception is authorized by origin. HTTP and WebSocket callbacks retain Core's raw transport values and gain frozen `context.codex` metadata.

JSON decoding is explicit and bounds both compressed and decoded bodies. Identity, gzip, deflate, Brotli and Zstandard are supported. Rewriting removes stale length, content-encoding and digest headers. SSE chunks are not assumed to be complete events. The SDK does not retry, reconnect or rewrite providers. `probe().available` requires the verified backend profile and Native `attached && available`; a listening worker or fixture hash does not establish Desktop, OAuth or attachment coverage.

The renderer `codex.backend.transport@1` / `registerThreadTransport` API remains a separate explicit channel selection at thread start/resume. It does not establish transparent process coverage.

## Packaged launch provider

Desktop Adapter has a renderer entry and a separate Host bundle. Its `host.provides` contains `codlet.client.launch@1/runtime`, with `host.process` and `cdp.raw`; it does not request `traffic.intercept`. The bundle exports the complete normal Host ABI and the optional `prepareClientLaunch`/`attachClientLaunch` entry points. Packaging and distribution snapshots include the Host bundle and its reproducible build closure.

`prepareClientLaunch({traffic,originalEnvironment,signal})` returns exactly the inspector, proxy-server and fixed proxy-bypass arguments accepted by Native. `attachClientLaunch` additionally receives the private `inspectorUrl`, `expectedPid` and `executable`. Before disclosing configuration it verifies the paused first frame's PID, canonical executable, browser process type and pre-ready state. It installs fixed bundled source, resumes, waits for supported Session configuration and a prepared backend, and closes the inspector. Readiness uses the remainder of one ten-second deadline; stages do not receive fresh budgets. Original-frame `require` is retained for inspector shutdown; no global `require` is assumed after resuming.

Supported Session implementations must expose both proxy configuration and certificate verification. Temporary trust permits only the launch CA's signature, matching hostname, leaf/CA validity and TLS server EKU, and only an authority-invalid error. Expiry, hostname, revocation, weak-signature and CT errors are never overridden. Missing APIs and failed proxy configuration reject readiness. No `allowUnverified` option exists.

## Backend tools

The verified Windows backend is `0.155.0-alpha.9.2`, SHA-256 `bc45017e8239dc150258f69309ced9df6bbcdf5b8e4f346decf780ac0999e226`. The main hook restores launch-modified keys in the parent environment, then injects only an exact verified `codex app-server` root. Unrelated main-process children and explicit environment maps retain original behavior.

A pinned-Node helper reads effective configuration using the original environment. Shell restoration preserves supported excludes/include-only/set policies and explicit request-level overrides. Configured stdio MCP transports, including initially disabled ones, use a fixed wrapper that removes values equal to this launch's injection and restores original values; explicit `server.env` values remain intact. The verified local code-mode host runs with the original environment through a supervised loopback gRPC endpoint. Its private lifetime pipe closes with its owner; logs are drained without persistent raw output. Failed preparations release directories and capacity before another attempt.

Real no-account tests cover the complete spawn hook, code-mode startup, `command/exec`, request-level explicit env, and a real MCP initialize handshake. They prove the configured startup snapshot. Dynamically added transports, replacement thread policies, shell profiles and arbitrary future native spawn paths are not a universal OS isolation guarantee; `allToolChildrenIsolated` remains false. macOS backend-specific behavior is not verified by the Windows hash.

## Repeatable developer checks

`tests/backend_isolation_cli.test.mjs` runs with `CODLET_TRAFFIC_BACKEND` set to an absolute verified backend path. It creates and removes a private home and needs no account, model call or installation. `tests/electron_bootstrap_protocol.test.mjs` exercises an actual Node inspector connection; it is not an official Desktop acceptance substitute.

`scripts/verify-official-main-owned.mjs --run-owned yes --executable ABSOLUTE_EXE --backend ABSOLUTE_BACKEND --core ABSOLUTE_CORE` creates a separate official process and uses the packaged prepare/attach contract. `--diagnose yes` adds bounded runtime/API field-name capture in test-only code. `--protocols yes` schedules fixture checks only after normal readiness; it does not bypass the production gate. The current reviewed package is expected to fail closed. `scripts/verify-owned-main-handshake.mjs` can instead attach to the exact new child already paused and owned by Native; it never discovers existing clients.

References: [Electron Session certificate verification](https://www.electronjs.org/docs/latest/api/session#sessetcertificateverifyprocproc), [URLLoader certificate error path](https://github.com/electron/electron/blob/main/shell/common/api/electron_api_url_loader.cc), [Codex shell environment](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/shell_environment.rs). The actual fork's runtime evidence takes precedence over assumptions from stock Electron.
