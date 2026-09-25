# Codex adapter contract

The adapters translate reviewed Codex Desktop internals into plugin capabilities. Core owns capability resolution, authenticated caller identity, RPC deadlines and permissions; see the [Core contract index](https://github.com/baoabaob/codlet/blob/main/docs/README.md). The adapters are ordinary explicitly authorized plugins, not a privileged bypass around Core.

## Compatibility and ownership

`compatibility/client-profiles.json` is the reviewed mapping of app version/build number, AppServer schema, module URLs and native exports. Builds with the same reported version and number on different platforms are selected by the exact renderer entry URL observed in `document.scripts`; an absent or unknown entry fails closed. Matching a marketing version or finding a similarly named function is insufficient. `bundled/codex-ui-adapter/client-versions.json` separately records versions accepted in real UI tests; source review or simulated tests alone do not add an acceptance record. Do not delete working older profiles merely because newer builds exist.

Adapters use the existing local Desktop connection, React scope and native navigation. They must not create another `connect-app-host` connection that replaces the Desktop view. Missing modules, changed object identity or a replaced patch make affected capabilities unavailable and produce diagnostics. Teardown restores only hooks still owned by that instance; conflicting patches can produce `reloadRequired`.

These plugins run in the main world and explicitly require `ui.mainWorld`; UI navigation also requires `ui.dom`. Main-world code is high trust. Core-authenticated tickets prevent accidental cross-owner API use but do not turn shared page JavaScript into an OS sandbox. Raw `ui.mainWorld`, `cdp.raw` and `host.process` capability ceilings remain Core policy, independent of these semantic adapters.

## UI adapter

Cold startup observes the existing native router before importing or initializing
the main AppShell. It never bootstraps the client on its behalf. The avatar window
declines page/composer leases without loading any main-window UI modules. This
matters for build 10789: calling the lazy Header initializer before its owning
shell initializes can reenter native module initialization and throw in an
uninitialized registration Set, leaving the official page loading indefinitely.
The fix was checked against the real Windows 26.917.8451.0 client in a fresh,
private profile; a fake local API key avoids accessing the user's account.
The original adapter reproduced `z4r → g3r.add` through `reviewedHeader → pq`;
the guarded adapter let both the main onboarding page and avatar render. This is
cold-start evidence, not full authenticated GUI or macOS acceptance.

`codex.ui.adapter` provides target capability `codex.ui.navigation.page@1` through `frontend/src/adapter/navigation.js`:

- `register({label, icon, token, toolbar?})` requires a Core-authenticated caller and a matching live DOM page lease owned by its plugin ID and generation. The route is `/codlet/<pluginId>/*`; auxiliary windows return an unavailable page with `path: null`.
- Native routing owns page activation, back/forward navigation and teardown. The adapter supplies the reviewed sidebar entry, native content outlet and optional native Header toolbar outlet. Lease removal retires its route and navigation entry.
- `newTaskDraft({prompt})` is restricted to the caller's active live page. It opens an editable local task composer and returns `{opened: true, submitted: false}`; it never submits the prompt.

The Core UI SDK registers these leases and renders the plugin's complete React tree. Native React objects and DOM elements remain in their existing execution worlds. There is no Worker rendering ABI or fixed-component/JSON UI restriction.

`codex.ui.composer.action@1` is a separate Target capability for ordinary plugins in either Renderer world. It is enabled only on a build whose composer root and native utility bar were structurally reviewed. A consumer creates an empty DOM lease with `data-codlet-composer-action-lease=<token>`, `data-codlet-composer-action-owner=<context.pluginId>` and `data-codlet-generation=<context.generation>`, then calls `register({token,label})`. The Adapter verifies the live lease against Core's authenticated RPC caller. It renders a button in each matching composer utility bar and dispatches `codlet:composer-action` on the lease when one is clicked. `CustomEvent.detail` is a JSON string `{api:1,token,placement,instance}` so main and isolated consumers have the same event contract. `instance` names the current `[data-codlet-composer-action-instance-id]` button container for a consumer-owned popover; it expires when that composer unmounts. The event contains no task ID or user text; the consumer must use a separately declared Desktop read capability and check current selection before acting. The event never submits a turn.

`status({token})` reports whether the caller's action remains registered and how many composer instances are currently mounted. `unregister({token})`, lease removal, provider retirement, composer replacement or window closure removes only that owner's button. Registration can be pending during cold startup, and a reviewed auxiliary window or unreviewed composer build returns `available:false`. Up to 32 actions per Target and eight per owner are accepted. Buttons remain tied to the caller generation through the live lease; a consumer removes its lease in `context.onDeactivate`. The Adapter never reads or edits another plugin's lease. The exact Windows build 10789 outlet was reviewed in `app-primary-b25c952dc388.js`: `data-codex-composer-root` encloses the action bar whose `data-composer-utility-bar-scroll-area` has one inner flex container. The reviewed `NJ` utility bar is used by the native composer in home and conversation surfaces. Other builds require their own profile entry and acceptance; a matching app version alone does not enable this capability.

The navigation observer ignores ordinary streaming-content mutations. Native navigation or lease changes still trigger reconciliation; removing this filtering requires a performance regression check.

## Desktop adapter

`codex.desktop.adapter` provides target-scoped API 1 capabilities from `frontend/src/desktop/entry.js`:

| Capability | Operations |
| --- | --- |
| `codex.desktop.compatibility` | `probe`, `waitReady`; report readiness, reviewed build and capability availability |
| `codex.backend.read` | `selection.get`, `threads.list/get/configuration`, `turns.list`, `items.list`, `models.list`, `skills.list`, `providers.list`, `approvals.list` |
| `codex.backend.write` | `threads.open`, `threads.reconfigure`, `turns.start/steer/interrupt`, `approvals.respond`, `getApi`, `configurations.list`; task-local model/provider configuration callback |
| `codex.backend.events` | Cursor-based `read`, `getApi` for an owned callback |
| `codex.ui.preSubmit` | `getApi`, `interceptors.list`; input rewrite/context injection before native `turn/start` |

Read results are bounded DTOs. Provider results omit credentials, URLs, environment mappings and raw config. Writes to a task require its resumed state and owner stream in this Desktop window. Opening a task validates its identity and lets the native route own resume. Cancellation after a dispatched write may yield `outcome_unknown`; callers inspect state/events rather than blindly repeat the write.

Approval responses use instance-owned tokens, revalidate the live request and reject unsupported schemas. Event cursors belong to one adapter instance, report gaps after eviction, and are invalid after retirement. The bounded event history is not a durable audit log.

Callback APIs require a declared capability acquired through Core RPC `getApi`, a one-use ticket tied to plugin ID/generation/capability, and a live main-world RendererContext. Tickets expire after 15 seconds. The returned `symbol` identifies the main-world API; plain RPC clients should use serializable operations instead of trying to serialize callbacks.

Pre-submit hooks have deterministic priority/owner/order, bounded concurrency and deadlines. Their failures stop that submission rather than silently bypassing requested transformations. They do not rewrite presentation or mutate stored history.

## Task configuration and explicit channels

`frontend/src/desktop/thread-configuration.js` applies one plugin-selected model or provider change to a local native `thread/start` or `thread/resume` request. A callback sees the task ID, working directory, model and provider. It can select an existing provider ID, or define one task-local Responses provider whose `baseUrl` is a private loopback HTTP endpoint, such as `context.traffic.openChannel` with an API path. A new provider has no ambient official OAuth. The Adapter does not edit global configuration, rebind an active turn or change the provider of an already-loaded task.

`registerThreadConfiguration({ appliesAt: ['turn.start'] }, handler)` lets a plugin choose the model for each task turn using the exact `draft.threadId`. It defaults to the thread start/resume phases when `appliesAt` is omitted. At `turn.start`, only `{ model }` is accepted; a provider change is rejected. The Adapter updates both the native `model` parameter and an existing `collaborationMode.settings.model`, preserving the rest of the mode. This matters because the Desktop composer can send `model: null` with an older model in collaboration settings. Task configuration runs before the existing text/context pre-submit hooks; with no matching configuration hook, the native request is unchanged.

An explicit `threads.reconfigure` operation can cold-resume the selected idle owner task on reviewed builds. It requires an already installed resume hook and checks the actual Native response against the requested model/provider; see [the traffic contract](traffic.md). Read `threads.configuration` before a change to retain a non-secret restoration point; either returned field may be null, in which case a plugin must not guess an original value. Provider routes are owned by their plugin generation and are not automatically restored after forced retirement.

The Host channel or verified plaintext source owns forwarding policy, credentials, permissions and traffic lifetime. Multiple configuration changes conflict. Retirement cancels pending selection, and late results cannot dispatch a retired request. The callback does not grant arbitrary backend settings or direct remote URLs; remote forwarding uses the consuming Host's exact-origin Core grants. Changes to this boundary must update this spec and the HTTP/WebSocket regression tests together.
