# Codex adapter contract

The adapters translate reviewed Codex Desktop internals into plugin capabilities. Core owns capability resolution, authenticated caller identity, RPC deadlines and permissions; see the [Core contract index](https://github.com/baoabaob/codlet/blob/main/docs/README.md). The adapters are ordinary explicitly authorized plugins, not a privileged bypass around Core.

## Compatibility and ownership

`compatibility/client-profiles.json` is the reviewed mapping of app version/build number, AppServer schema, module URLs and native exports. Matching a marketing version or finding a similarly named function is insufficient. `bundled/codex-ui-adapter/client-versions.json` is an additional shipped UI compatibility inventory; keep it consistent during reviewed profile changes. Do not delete working older profiles merely because newer builds exist.

Adapters use the existing local Desktop connection, React scope and native navigation. They must not create another `connect-app-host` connection that replaces the Desktop view. Missing modules, changed object identity or a replaced patch make affected capabilities unavailable and produce diagnostics. Teardown restores only hooks still owned by that instance; conflicting patches can produce `reloadRequired`.

These plugins run in the main world and explicitly require `ui.mainWorld`; UI navigation also requires `ui.dom`. Main-world code is high trust. Core-authenticated tickets prevent accidental cross-owner API use but do not turn shared page JavaScript into an OS sandbox. Raw `ui.mainWorld`, `cdp.raw` and `host.process` capability ceilings remain Core policy, independent of these semantic adapters.

## UI adapter

`codex.ui.adapter` provides target capability `codex.ui.navigation.page@1` through `frontend/src/adapter/navigation.js`:

- `register({label, icon, token, toolbar?})` requires a Core-authenticated caller and a matching live DOM page lease owned by its plugin ID and generation. The route is `/codlet/<pluginId>/*`; auxiliary windows return an unavailable page with `path: null`.
- Native routing owns page activation, back/forward navigation and teardown. The adapter supplies the reviewed sidebar entry, native content outlet and optional native Header toolbar outlet. Lease removal retires its route and navigation entry.
- `newTaskDraft({prompt})` is restricted to the caller's active live page. It opens an editable local task composer and returns `{opened: true, submitted: false}`; it never submits the prompt.

The Core UI SDK registers these leases and renders the plugin's complete React tree. Native React objects and DOM elements remain in their existing execution worlds. There is no Worker rendering ABI or fixed-component/JSON UI restriction.

The navigation observer ignores ordinary streaming-content mutations. Native navigation or lease changes still trigger reconciliation; removing this filtering requires a performance regression check.

## Desktop adapter

`codex.desktop.adapter` provides target-scoped API 1 capabilities from `frontend/src/desktop/entry.js`:

| Capability | Operations |
| --- | --- |
| `codex.desktop.compatibility` | `probe`, `waitReady`; report readiness, reviewed build and capability availability |
| `codex.backend.read` | `selection.get`, `threads.list/get`, `turns.list`, `items.list`, `models.list`, `skills.list`, `providers.list`, `approvals.list` |
| `codex.backend.write` | `threads.open`, `turns.start/steer/interrupt`, `approvals.respond` |
| `codex.backend.events` | Cursor-based `read`, `getApi` for an owned callback |
| `codex.ui.preSubmit` | `getApi`, `interceptors.list`; input rewrite/context injection before native `turn/start` |
| `codex.backend.transport` | `probe`, `getApi`, `interceptors.list`; explicit channel selection at native task start/resume |

Read results are bounded DTOs. Provider results omit credentials, URLs, environment mappings and raw config. Writes to a task require its resumed state and owner stream in this Desktop window. Opening a task validates its identity and lets the native route own resume. Cancellation after a dispatched write may yield `outcome_unknown`; callers inspect state/events rather than blindly repeat the write.

Approval responses use instance-owned tokens, revalidate the live request and reject unsupported schemas. Event cursors belong to one adapter instance, report gaps after eviction, and are invalid after retirement. The bounded event history is not a durable audit log.

Callback APIs require a declared capability acquired through Core RPC `getApi`, a one-use ticket tied to plugin ID/generation/capability, and a live main-world RendererContext. Tickets expire after 15 seconds. The returned `symbol` identifies the main-world API; plain RPC clients should use serializable operations instead of trying to serialize callbacks.

Pre-submit hooks have deterministic priority/owner/order, bounded concurrency and deadlines. Their failures stop that submission rather than silently bypassing requested transformations. They do not rewrite presentation or mutate stored history.

## Explicit channel transport

`frontend/src/desktop/transport.js` currently attaches an explicitly selected private loopback HTTP/WebSocket channel to native `thread/start` or `thread/resume` configuration. Its probe reports the actual coverage. It does not claim transparent takeover of an active turn, an already-loaded task or official OAuth traffic.

The hook selects channel/path/model only; the channel's Host owner and Core retain forwarding policy, credentials, permissions and traffic lifetime. Multiple selected channels conflict. Retirement cancels pending selection, and late results cannot dispatch a retired request. Changes to this boundary must update this spec and the HTTP/WebSocket regression tests together.
