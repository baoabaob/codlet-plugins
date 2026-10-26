# Contributing and testing

Develop ordinary plugin sources here. Core owns Codex semantics and supplies `context.codex`; native version adaptation, profiles and probes belong under Core's `codex/`. Generated distribution repositories accept reproducible source snapshots.

## Clean checkout

Use Node 24, npm and Git. SDK-dependent checks need an explicitly built matching Core checkout.

```text
npm ci --prefix frontend
node frontend/build.mjs
node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT
node --test tests/*.test.mjs
node scripts/package.mjs --output ABSOLUTE_FRESH_OUTPUT --fixture
```

`prepare-core-sdk.mjs` copies Core UI, page and i18n bundles plus the shared signing tool and records the Core commit in ignored `.core-sdk/`. An optional second absolute argument chooses a different snapshot output; set `CODLET_CORE_SDK_ROOT` to that path for UI tests, preview and profiling. Packaging and distribution checks use the default `.core-sdk/` snapshot. GUI builds do not require a snapshot. The command above creates a local fixture package; publication requires the retained publisher signing key as described in [publishing](publishing.md).

`frontend/build.mjs` builds the GUI from `plugins.json`. Generated `bundled/` files and third-party notices remain checked in. There is no Adapter or Host build branch in this repository. The distribution test packages sources into a temporary output and needs Git metadata; it does not read or replace historical `dist/`.

## Review and tests

Keep IDs, capabilities, permissions and versions explicit. Update the maintained spec when behavior changes, rebuild bundles, and run the relevant checks plus `git diff --check`. Do not copy account data, active installation directories or SDK snapshots into Git.

| Tests | What they establish |
| --- | --- |
| `codlet_controller`, `codlet_gui`, notices, tags and `combined_update` | Management receipts, stale replies, permissions, update state and UI cleanup |
| `marketplace-model`, `codlet_marketplace_gui` | Repository provenance, declarations, bounded portability audit and rendered search |
| `distribution.test.mjs`, `distribution.ps1` | Build closure, package hashes, traversal rejection and publisher ownership |
| `codlet_v1_state`, `functional_fixture` | Explicit state restore, permission labels, settled reports and synthetic model guards |

The [complete functional consumer](../tests/fixtures/runtime-compatibility/consumer/README.md) uses the semantic SDK plus explicit Node/`host.raw` for owned fixture servers. Its child process requires an exact `executables` grant; `clientPermissions:true` does not select it. Ordinary activation never auto-submits a model turn, but Host activation writes its own report. Use the [fixture guide](../tests/fixtures/runtime-compatibility/README.md) for effects and controlled execution.

Consumers that survive Core updates declare JSON `saveState`/`restoreState` hooks. Save settled data only; do not serialize live servers, streams, pending mutations, closures or consent. Use `context.restoringState` to suppress activation effects. Whole-Core updates can defer when a consumer cannot checkpoint.

UI/Desktop implementation tests and opt-in backend/Native diagnostics now run from [Core](https://github.com/baoabaob/codlet/blob/main/docs/development.md), including `node codex/test.mjs` and [codex/scripts](https://github.com/baoabaob/codlet/blob/main/codex/scripts/README.md). They are not duplicated here. Offline GUI tests do not establish Native visual, physical input or installer acceptance.

Publisher checks use PowerShell:

```powershell
powershell -NoProfile -File tests/distribution.ps1
```

## Previews and profiling

After building and preparing the SDK:

```text
node scripts/serve-gui-preview.mjs
node --expose-gc scripts/profile-runtime.mjs ui .artifacts/ui.json
node --expose-gc scripts/profile-runtime.mjs gui .artifacts/gui.json
```

Open the preview's printed loopback URL. It mounts the production GUI with Core's UI SDK and deterministic in-memory management responses, including marketplace fixtures. `scripts/preview-context.mjs` and `preview-fixtures.mjs` share that setup with tests.

Only `ui` and `gui` are profiling workloads. `CODLET_PROFILE_CYCLES` controls GUI repetitions. These Node/jsdom checks measure owned resources and heap retention; compare runs using the same Node/V8 version. They do not establish Chromium world or Native process memory bounds.

## Local outputs

`frontend/node_modules/`, `.core-sdk/`, `.artifacts/` and `dist/` are ignored. Install dependencies, prepare SDK inputs and generate packages explicitly. Preserve release receipts and existing versioned artifacts. Stop owned processes before removing obsolete runs. Publishing is an explicit operation under the [distribution guide](publishing.md).
