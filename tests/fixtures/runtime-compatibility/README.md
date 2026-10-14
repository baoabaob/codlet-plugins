# Functional acceptance consumer 1.0.0-rc.1

Extends the complete 0.0.3 consumer and retains its functional checks. The v1
candidate uses Core's `context.codex` semantic SDK and requires no installed
UI/Desktop Adapter. It retains direct Native DOM assertions/main-world callbacks
and explicitly chooses Node/`host.raw` for owned fixture servers. The installable
directory is `consumer/`; no source build is needed for directory import. Its
report page, explicit run button and JSON export remain. See its README for
effects and manual boundaries. Ordinary installation never auto-submits a model
turn. Its fixture ZIP can be reproduced with:

```text
node tests/fixtures/runtime-compatibility/package.mjs ABSOLUTE_OUTPUT_DIRECTORY
```

## Owned desktop run

Build Core's opt-in `codlet-desktop-acceptance` binary and use the Core runner
`scripts/desktop-acceptance.mjs` with a new absolute `root`, verified official
`clientApp`, four-component `packageVersion`, `pluginsRoot`, and `testBinary`.
Supply this absolute `consumer` path in `extraPlugins`. Generate the probe first:

```text
node tests/fixtures/runtime-compatibility/build-probe.mjs ABSOLUTE_PROBE_JS
```

Pass that file as `probeScript`; configure `localApiKeyFixture: true`,
`ownedBackend: true`, `functionalTestAuto: true`, `foreground: true`,
`fixtureResponseDelayMs: 1500`, and a sufficient `durationSeconds` (110–180).
The fixture needs `extraPluginPolicies: {"compatibility.acceptance":
{"clientPermissions": true,"executables":["ABSOLUTE_PINNED_HOST_NODE_EXECUTABLE"]}}`
for its declared standard OS categories and exact streaming-child executable.
`clientPermissions` never selects the executable; choose the Node actually used
by the managed Host (`process.execPath`), not an arbitrary PATH Node. Optional
`cwdRoots`/`envKeys` remain explicit. Use
`fixtureWebSocket: false` for HTTP/SSE and `true` for Responses WebSocket.
`lifecyclePlugin: "compatibility.acceptance"` invokes the same exact test binary's
scoped public CLI after completion, snapshots the functional report, and audits
reload/disable/enable plus Host cleanup. It does not self-disable through RPC.

The probe allocates one synthetic local task through the already mounted Native
connection, waits for one seed turn to persist, then lets the plugin use public
task-open/read/write/events and submit APIs. No alternate app-host connection or
Native factory is created. It registers the owned model interceptor before that
task opens a WebSocket, since a later registration cannot retroactively change
an existing connection. Failed/unknown writes are never automatically retried.

Complete synthetic onboarding via `fixtureState` if the fresh client needs it.
For the accepted Windows 26.930 run, the observed `electron-persisted-atom-state`
included the completed conversational onboarding, role `engineering`,
`workMode: "coding"`, completed projectless onboarding, and composer mode `work`.
These are fixture preferences, not changes to the daily client.

Require a completed report with all expected non-manual Renderer/Host checks passed, no fixture
error, both native sources activated, ready runtime skill, zero plugin errors and
normal shutdown. Also require `lifecycle.json.passed` when lifecycle auditing is
requested; after re-enable, the live probe should have one owned navigation
entry/report node and no leftover composer leases. Settled observations now transfer
through explicit `saveState`/`restoreState`; active runs reject state checkpoints.
Live servers, streams, pending writes and model operations are not reconstructed
or replayed. Keep exported reports as independent evidence. Merely enabling a
plugin or reporting source activation is insufficient.

Before a whole-Core update probe, explicitly call the mounted acceptance object's
`releaseFixtureTraffic()` after its Renderer and Host reports settle. This invokes
the same-plugin `native.end` Host method; it refuses running checks or active accepted
exchanges, awaits the owned interceptor's close, and keeps the report available for
state transfer. It does not cancel an ongoing model stream. Dedicated continuity
streams must use the separately owned Core fixture route, not a retained plugin
interceptor, because live plugin traffic makes online activation defer to next start.

## Read-only mount and evidence

Keep `fixture.json.autorun` false (or omit the file) for an inspection-only mount.
Do not click Run, invoke the `Symbol.for('codlet.functional.acceptance')` object's
`run`/`prepareFixture`, or supply a fixture thread. Host activation still writes
its own `host-report.json`; there is no total read-only switch. A full manual run
also opens an unsent draft and mutates only the documented synthetic test resources.
Model operations require an exact owned-root `owner.txt`, `autorun:true`, and an
HTTP `127.0.0.1` base URL. `context.restoringState` suppresses autorun during restore.

The historical 0.0.3 Windows `26.930.2377.0` / frontend `26.930.21537` / build `12776` / backend
`0.159.0-alpha.12.1` fixture passed both protocols with Desktop Adapter 0.2.7 and
UI Adapter 0.1.10. The startup worker regression required consuming the Adapter's
own inspector argument and filtered native worker defaults. Live OAuth, new
MSIX installation, native dialogs/clipboard/notifications/shortcuts and other
platforms are not established by these synthetic checks. That historical record
does not certify the v1 candidate. Current source/SDK and managed Host state tests
are automated evidence; new Native acceptance must name its actual client build,
fixture, protocol, report and lifecycle receipt.
