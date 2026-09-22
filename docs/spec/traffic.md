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

## Main-process and tool environment adapters

`host/electron-bootstrap.cjs` exports `attachElectronTrafficBeforeEntry`. Native launches its exact owned child with `--inspect-brk=127.0.0.1:0` and Chromium's proxy switches, then obtains the random debugger URL from that child's private stderr. The helper never scans ports or attaches to an existing client. It verifies the PID, canonical executable, browser process type and pre-ready state on the first paused call frame **before** disclosing configuration. It installs the fixed Adapter hook, resumes execution, waits for session configuration, and closes the inspector. The handshake has a ten-second deadline. Native must reap its exact child on any failure; a failed handshake is never grounds to continue a partially attached client. Real official-build inspector/fuse support is still unverified.

`host/electron-traffic.cjs` exports `installElectronTraffic({app,session}, {proxyUrl,caPem,originalProxy})`. It must run through a Native verified main-process bootstrap before application entry, and rejects installation after app readiness. Native must provide Chromium's initial `--proxy-server` before startup as well, so no earlier ready listener can bypass asynchronous `setProxy`. The hook installs session proxy settings, answers authentication only for the private loopback endpoint, and accepts a server leaf only when its signature chains directly to this launch's CA, its exact hostname and validity match, and its EKU permits TLS server authentication. All other certificates use Chromium's normal verification. Shutdown restores the supplied original proxy settings and default verification. A hook fixture passing does not establish that the official app's early bootstrap or attachments have been exercised; its status remains unavailable pending that acceptance.

`host/backend-launch.cjs` exports `prepareBackendLaunch({executable,arguments,originalEnvironment,environmentPatch,shellPolicy,platform})`. It verifies the actual backend binary digest and prepares backend proxy/trust plus shell policy restoration without changing saved user configuration. `shellPolicy` must be the original effective policy before injection, including the project's overlays. `host/backend-tool-environment.cjs` exposes the underlying restoration function. It preserves existing excludes/include-only/set values, removes injected launch variable names and restores only original values permitted by the old policy. Unverified filters/profile modes are rejected.

The real isolated backend `command/exec` probe verifies that the original proxy is restored and launch proxy/CA variables disappear from its child. Run `node scripts/verify-tool-traffic-environment.mjs ABSOLUTE_BACKEND_PATH`. It creates and removes a fresh home, uses public test certificates and no login or model request, and prints booleans only. This proves the command execution path, **not** MCP/code-mode-host or all descendant processes. Per-request env overrides and shell profiles need separate checks; `allToolChildrenIsolated` remains false. Native must not advertise complete transparent traffic until those launch paths have been integrated or explicitly excluded from supported coverage.

References: [Electron session proxy and certificate APIs](https://www.electronjs.org/docs/latest/api/session), [Codex shell environment derivation](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/shell_environment.rs). Actual backend compatibility is bounded by the checked executable hash, not the upstream source version.

## Packaged launch provider and downstream restoration

Desktop Adapter is a combined renderer/Host package. Its Host exports `prepareClientLaunch({traffic,originalEnvironment,signal})` and `attachClientLaunch({traffic,originalEnvironment,signal,inspectorUrl,expectedPid,executable})`, selected through `host.provides: codlet.client.launch@1/runtime`. It requests `host.process` and `cdp.raw`, not `traffic.intercept`. A separate enabled, granted traffic consumer triggers Native's gateway. The renderer capability list is unchanged. The Host bundle embeds the fixed main bootstrap source, so Native need not compile any official client knowledge into Core.

Main startup restores the affected proxy/trust keys from the original parent environment before application code captures them. The main hook changes only absolute, hash-verified `codex app-server` spawns; other main-process children and their explicit environment maps are untouched. A separate pinned-Node helper reads effective backend configuration over a fresh stdio app-server using the original environment. It never authenticates or sends a model request.

For supported Windows backend builds, shell policy restoration applies to `command/exec` and preserves request-level explicit env overrides. Existing canonical filters are supported except exact include rules that conflict with removing a launch variable; profile modes are declined rather than rewritten. Configured stdio MCP commands, including initially disabled ones that Desktop may enable per thread, are wrapped with fixed pinned Node code. The wrapper removes only values equal to this launch's injected values and restores original values; `server.env` overrides remain unchanged. The backend automatically copies custom CA variables to MCP, so restoring shell policy alone is insufficient.

When local code-mode-host is enabled, main starts the verified adjacent `codex-code-mode-host.exe` with the original environment and `--listen grpc://127.0.0.1:0`, then supplies its endpoint through backend `--code-mode-host`. The backend does not create a code-mode child carrying its injected environment. A pinned-Node supervisor retains only the bounded startup endpoint, drains and discards server logs, and stops the sidecar when its private stdin lifetime pipe closes. The owned sidecar closes with its backend; Native's process owner remains responsible for whole-tree cleanup. An explicitly configured remote code-mode host is preserved. macOS and other binary hashes remain unverified for this backend-specific path.

`tests/backend_isolation_cli.test.mjs` exercises the real hash-verified backend in a fresh private home: code-mode sidecar startup, restored shell proxy, absent launch CA, preserved explicit `command/exec` env, and a real stdio MCP initialize handshake whose child reports restored proxy/absent CA/preserved explicit MCP env. Enable with `CODLET_TRAFFIC_BACKEND=ABSOLUTE_BACKEND_PATH`. It needs no account, model call or installation. Startup failures also reap owned processes before deleting their private working directory.

These checks cover the configured startup snapshot. They do not claim universal interception of Rust `CreateProcess`/`execve`, arbitrary future plugin-provided MCP additions, changed per-thread shell policy, or a shell profile that reintroduces values. Unsupported policy/build paths launch the original backend unchanged and report declined coverage; `allToolChildrenIsolated` remains false. The packaged main hook's ready handshake waits for a prepared backend root as well as configured sessions. An unsupported or unobserved backend fails that handshake; Native must reap the attempted owned launch. Availability still does not imply that future configuration changes or arbitrary descendant processes are covered.

For a no-account main-entry check, Native starts a fresh isolated owned client with the two arguments returned by `prepareClientLaunch`, a new `CODEX_HOME`/`CODEX_ELECTRON_USER_DATA_PATH` and private debugger output. Then run `node scripts/verify-owned-main-handshake.mjs --owned-pid PID --executable ABSOLUTE_EXE --inspector-file PRIVATE_WS_FILE --traffic-file PRIVATE_DESCRIPTOR_JSON --original-environment-file PRIVATE_ENV_JSON`. It attaches only after exact identity verification, emits bounded booleans, and never discovers or terminates another client. Native must reap that exact test child on failure. Main-entry validation does not itself prove an actual model or attachment request was intercepted.
