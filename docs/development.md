# Contributing and testing

Develop plugin sources in this repository. Generated distribution repositories accept reproducible source snapshots, not independent edits. Core v1 owns the Codex semantic implementations and supplies `context.codex`; the retained UI/Desktop Adapter sources support reviewed legacy consumers and regression comparisons. New SDK consumers do not install those adapters or inherit their raw permissions. Keep generic runtime/OS behavior in [Core](https://github.com/baoabaob/codlet/blob/main/docs/development.md).

## Clean checkout

Prerequisites: Node 24, npm, Git, and a matching Core checkout for SDK-dependent tests. The last offline profile used Node 24.18.1; compare performance runs on the same Node version. PowerShell is needed only for the publisher checks and synchronization script.

```text
npm ci --prefix frontend
node frontend/build.mjs
node scripts/package.mjs
node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT
node --test tests/*.test.mjs
```

Build the matching Core SDK according to its development guide before preparing the snapshot. `prepare-core-sdk.mjs` copies Core's UI, page, i18n and Host traffic bundles to ignored `.core-sdk/` and records the Core commit. It neither registers plugins nor needs a personal installation. Build/package alone do not require `.core-sdk/`; tests that use it intentionally require this explicit preparation step. The distribution test packages current sources into a temporary output directory and requires Git metadata; it does not read or replace `dist/`.

`frontend/build.mjs` builds every entry in `plugins.json`, including retained legacy Adapter entries. Generated renderer files under `bundled/` are intentional checked-in build inputs; rebuild them after source changes. `legacyAdapters` excludes the two adapters from current v1 package/distribution output, so normal release output contains the GUI. The build includes required third-party license notices and rejects missing notices. Do not strip notices or manually edit bundles.

The production plugins use Core's supplied UI SDK. This repository does not rebuild Apps SDK UI or its Tailwind/PostCSS pipeline. Its npm development dependencies are esbuild, jsdom, React/ReactDOM for the native-shell fixture, and ws for the transport fixture.

## Change review

- Keep IDs, capabilities, permissions and per-plugin versions explicit in manifests. A new installer preset or compatibility profile needs its own review.
- Preserve working older client profiles and API 2 feature detection until support is deliberately retired; age alone is not evidence of dead code.
- Extend the relevant behavior test when changing an adapter, management state transition or security boundary. Run the full suite before distribution.
- Run `git diff --check` and review generated bundle changes. Update the current spec, not a new date-stamped progress report.
- Do not copy user credentials, active plugin directories or local SDK snapshots into the repository.

## Test coverage

| Tests | What they establish |
| --- | --- |
| `codex_ui_adapter`, `codex_desktop_adapter`, `thread_configuration` | Native shell ownership, semantic mapping, drift, hooks, cancellation and retirement |
| `codlet_controller`, `codlet_gui`, notices, tag search, `combined_update` | Management receipts, stale async replies, permissions, update states, focus and UI cleanup |
| `marketplace-model` | Repository provenance, sorting, declarations and bounded portability audit; not live catalog acceptance |
| `distribution.test.mjs`, `distribution.ps1` | Build closure, package hashes, traversal rejection and remote snapshot ownership |
| `thread_configuration_cli` | Opt-in real AppServer HTTP/WebSocket fixture; skipped unless `CODLET_TEST_OFFICIAL_CLI` points to an executable |
| `codlet_v1_state`, `functional_fixture` | Current-source GUI state restore, permission enforcement labels, deferred receipt guards, settled functional report state and synthetic model ownership guards |

The native CLI fixture uses its own temporary home, synthetic prompt and loopback server. It does not use a user auth file or a real model endpoint. A passing jsdom or CLI test is not a native Desktop visual/accessibility or OS installer acceptance result.

On Windows, run the native turn fixture only on a disposable VM/host and set `CODLET_TEST_DISPOSABLE_WINDOWS_HOST=1` there. A temporary profile does not isolate native sandbox accounts/firewall changes. SDK/Host tests should set `CODLET_CORE_ROOT` to the matching Core checkout so their owned Node fixtures are included.

The [complete functional consumer](../tests/fixtures/runtime-compatibility/consumer/README.md)
uses the current semantic SDK, plus explicit `node`/`host.raw` for its owned raw
fixture servers. Its selected Node child executable still needs an exact `executables`
grant; `clientPermissions: true` does not select it. Mounting and a full run have
different effects: no ordinary installation auto-submits a model turn, but Host
activation writes its own `host-report.json`. Disable autorun for read-only Native
mounts and do not invoke the run/draft/model hooks. Full run creates only the documented
synthetic resources; model writes need the owned loopback fixture guard.

Use explicit JSON `saveState`/`restoreState` hooks for consumers expected to survive
online Core JS replacement. Snapshot hooks must not start new writes. Preserve only
settled state, not closures, DOM, live servers/streams, pending mutations or consent.
Use `context.restoringState` to suppress automatic effects during activation/restore.
Legacy no-hook reload remains supported; whole Core updates can defer when active
consumer state transfer is not declared. Root's `host_capability`, `host_lifecycle` and
`host_renderer_vm_tests` exercise denial, drain, resume and rollback through real
managed Node/JSONL and bounded VM worlds; they do not establish Native visual or
cross-platform acceptance.

For the separately verified Desktop JS and backend provider boundaries, use the opt-in [request-chain drivers and coverage limits](spec/request-chain.md). These require the reviewed real client build and are not normal CI tests.

```powershell
powershell -NoProfile -File tests/distribution.ps1
```

## Previews and performance

After building and preparing the SDK, run the production GUI preview and open the printed loopback URL:

```text
node scripts/serve-gui-preview.mjs
```

The production GUI preview uses deterministic in-memory management responses and includes the marketplace. It is a development tool; see the [marketplace contract](spec/marketplace.md). The superseded standalone prototype is available in Git history.

`scripts/preview-runtime.mjs`, `tests/support/ui-fixture.mjs` and `tests/support/native-shell.js` are shared by current regression tests and should not be removed as old demos.

```text
node --expose-gc scripts/profile-runtime.mjs navigation .artifacts/navigation.json
node --expose-gc scripts/profile-runtime.mjs gui .artifacts/gui.json
```

Other workload names are `ui` and `desktop`; `CODLET_PROFILE_CYCLES` controls GUI repetitions. These offline Node/jsdom workloads measure owned listeners, nodes, scans and heap retention. They do not reproduce Chromium isolated-world retention or prove native RSS is bounded. Use [Core's known issues](https://github.com/baoabaob/codlet/blob/main/docs/known-issues.md) for that boundary.

## Generated local files

`frontend/node_modules/`, `.core-sdk/`, `.artifacts/` and `dist/` are ignored. They are never dependencies of a clean source checkout: install dependencies, prepare the SDK and regenerate packages explicitly. Remove obsolete local runs only after stopping their processes. Keep the current `dist/release-lock.json` while managing a release channel: it is a publisher receipt, not a backup. Publishing and visibility changes follow the [distribution guide](publishing.md).
