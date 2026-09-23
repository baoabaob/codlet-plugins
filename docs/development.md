# Contributing and testing

Develop in this repository. Generated distribution repositories accept reproducible source snapshots, not independent edits. Keep plugin semantics here and generic runtime/OS behavior in [Core](https://github.com/baoabaob/codlet/blob/main/docs/development.md).

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

`frontend/build.mjs` builds every entry in `plugins.json`. The three generated renderer files under `bundled/` are intentional checked-in distribution inputs; rebuild them after source changes. The build includes required third-party license notices and rejects missing notices. Do not strip notices or manually edit bundles.

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
| `marketplace-model` | Prototype provenance, sorting, compatibility inference and bounded portability audit; not live catalog acceptance |
| `distribution.test.mjs`, `distribution.ps1` | Build closure, package hashes, traversal rejection and remote snapshot ownership |
| `thread_configuration_cli` | Opt-in real AppServer HTTP/WebSocket fixture; skipped unless `CODLET_TEST_OFFICIAL_CLI` points to an executable |

The native CLI fixture uses its own temporary home, synthetic prompt and loopback server. It does not use a user auth file or a real model endpoint. A passing jsdom or CLI test is not a native Desktop visual/accessibility or OS installer acceptance result.

For the separately verified Desktop JS and backend provider boundaries, use the opt-in [request-chain drivers and coverage limits](spec/request-chain.md). These require the reviewed real client build and are not normal CI tests.

```powershell
powershell -NoProfile -File tests/distribution.ps1
```

## Previews and performance

After building and preparing the SDK, run either loopback-only preview and open the printed URL:

```text
node scripts/serve-gui-preview.mjs
node scripts/marketplace-preview/serve.mjs
```

The production GUI preview uses deterministic in-memory management responses. The marketplace preview is separate from production and has synthetic data; see its [integration requirements](spec/marketplace.md). Both are development tools, not installation interfaces.

`scripts/preview-runtime.mjs`, `tests/support/ui-fixture.mjs` and `tests/support/native-shell.js` are shared by current regression tests and should not be removed as old demos.

```text
node --expose-gc scripts/profile-runtime.mjs navigation .artifacts/navigation.json
node --expose-gc scripts/profile-runtime.mjs gui .artifacts/gui.json
```

Other workload names are `ui` and `desktop`; `CODLET_PROFILE_CYCLES` controls GUI repetitions. These offline Node/jsdom workloads measure owned listeners, nodes, scans and heap retention. They do not reproduce Chromium isolated-world retention or prove native RSS is bounded. Use [Core's known issues](https://github.com/baoabaob/codlet/blob/main/docs/known-issues.md) for that boundary.

## Generated local files

`frontend/node_modules/`, `.core-sdk/`, `.artifacts/` and `dist/` are ignored. They are never dependencies of a clean source checkout: install dependencies, prepare the SDK and regenerate packages explicitly. Remove obsolete local runs only after stopping their processes. Keep the current `dist/release-lock.json` while managing a release channel: it is a publisher receipt, not a backup. Publishing and visibility changes follow the [distribution guide](publishing.md).
