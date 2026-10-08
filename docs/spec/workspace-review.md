# Workspace implementation and acceptance

UI Adapter **0.1.11** adds target capability `codex.ui.workspace@1`. Desktop Adapter **0.2.16** adds `codex.backend.read@1 / threads.loaded` and `thread.summary.changed` events. The stable consumer contract is [workspace-api.md](../workspace-api.md); declarations are in `types/workspace.d.ts`. Layout, persistence, dragging, selection and tooltips remain consumer responsibilities.

## Current native evidence

Initial acceptance used the running Windows x86-64 client **26.1002.7124.0** with Core **0.2.0-preview.29**, through supported local acceptance registrations and Core-owned CDP sessions. At that point the official GitHub UI Adapter 0.1.10, Desktop Adapter 0.2.15 and GUI 0.1.9 registrations were retained. The coordinating chat subsequently migrated both adapters to local sources for integration. This adapter implementation and its follow-up discovery fix publish no release or remote repository and do not reload those installations. The independent split-workbench repository was only read as a reference.

The actual current module graph and mounted component ownership established native React factories, the main surface/body/footer, activity placement, ComposerScope, transcript Content, native thread subscription, shortcut capture/row/command hooks and the existing keymap signal. Generated export names and hashes are discovered privately. UIKit's callable source proxies are skipped when inspection is unavailable; role matching still requires unique positive evidence.

Native Content does **not** own the required thread subscription in this client: the subscription sits beside it in Native's own page wrappers. Workspace mounts that discovered component privately. Three simultaneously mounted copies each contained 5,966 conversation-body characters; readiness was not inferred from an empty scroller. Native scroll uses `flex-direction:column-reverse`: `scrollTop=41` clamps to zero and `scrollTop=-41` round-trips, so the API accepts finite signed CSS offsets. Flags preserve the ready state, subscription, providers, scope value, root and scroll node. Native history already dispatched is shared and has no independent abort API; queued work and late commits are cancelled by adapter retirement.

The activity slot, composed suppression/restoration, loaded metadata without history, native shortcut registration and its official settings row all passed. The fixture restored its original route and removed its containers and subscriptions. Native capture/conflict/clear/restore/search behavior also has regression coverage using real React with a deterministic native-shell fixture. The real-client probe verified the actual row and programmatic binding changes; it did not claim full OS accessibility, screenshot/theme or macOS acceptance.

## Performance scope

The main Codex window was brought to the foreground during acceptance. Its backing target `2ECFBB849AAD6E44715AB0FE665072D4` continued to report `visibilityState:hidden`; `Page.bringToFront` did not change that report. Results below measure native commit completion through an owned commit marker, not a claim of foreground paint latency. The final fixture uses no animation-frame timeout as an update-completion substitute.

Earlier 60-second samples came from Chromium throttling chained background timers in the probe. They were removed from operation measurements. Workspace now batches committed semantic events by microtask when the backing document reports hidden and by frame when visible; it uses no recurring timer. Streaming body mutations do not invalidate the workspace structure. An idle observation produced zero workspace revision changes; this is not a claim of zero CPU use by Native or the whole client.

One final native run observed:

| Operation | Measured time / evidence |
| --- | --- |
| Native base discovery at adapter activation | 795 ms, previously about 5,291 ms |
| Initial three transcript mounts | 1,351 ms, including feature discovery and native commits |
| Cached one-transcript mount | 244 ms |
| Flags-only enqueue | 0–0.1 ms |
| Flags-only native commit, 8 samples | 64–170 ms |
| Rebind to another already-loaded thread, waiting for ready | 315 ms |
| Activity slot after synchronous placement | 1 ms |
| Shortcut readiness with native settings discovery | 156 ms |
| 10,000 cached snapshot reads | 0.4 ms |
| Idle revision changes | 0 |

These are one-machine samples with existing conversation content and simultaneous client work, not general latency guarantees. The fixture report records each sample and source-read timing in `.artifacts/workspace-acceptance/consumer/report.json`. A standalone local parser benchmark on the current formatted shared source (10,325,008 characters) took about 349 ms. The new tokenizer constructs ASTs only for possible CommonJS factories and the export map; it does not construct an AST for Native's unrelated UI functions. It preserves export-relationship and ambiguity validation.

Discovery/modules/connection and history are cached; history starts at most two reads concurrently. Transcript loading state shares one manager listener. Flags across roots are merged into one microtask and scheduled through Native React instead of repeated `flushSync`. Synchronous initial commits are limited to mounting and rebinding. Native providers' own per-view subscriptions and rendering remain Native's responsibility.

## Large-tree integration fix

The first split-workbench integration reported `Desktop tree exceeds the discovery limit`. Its exact trigger was `hostFibers()` in `localConnection()`: this collected the entire root tree before examining any AppScope candidates and rejected more than 20,000 fibers. Workspace called that path on first transcript/shortcut discovery. Desktop's separate 4,096-fiber scope/navigation walks also depended on conversation size or traversal order.

UI and Desktop now share the native navigation landmark's ancestry, bounded to 256 fibers. This contains the shell's AppScope and router, without descending into messages or pane trees. Cold/auxiliary documents without that landmark retain the existing bounded fallback; duplicate landmarks, detached/cyclic ancestry and unknown large trees still fail closed. The limit was not raised.

Captured AppScope providers are checked against the current root through actual parent/child links. This handles committed alternates and reused children, rejects stale detached providers even when their return links still point at an old root, and preserves the outer AppScope when a route/sidebar unmounts. Steady-state connection checks reread only the two previously verified local families, and Workspace uses the same private ownership check. Desktop also captures the discovered message-transport export bindings rather than enumerating all native exports on every callback. No private fiber, scope or service object is added to the consumer API.

Regression tests construct three simultaneous native panes with **72,008 fibers**. Discovery visits **5 shell ancestors**, and repeated Desktop/Workspace connection checks perform **zero shell rediscovery queries**. The test acquires the public Desktop events ticket, reads loaded summaries and receives native state callbacks while preserving compatibility/navigation availability. Separate checks cover alternate commits, shared children, provider replacement/removal, duplicate landmarks and the bounded fallback.

A read-only follow-up probe on Core PID **48220**, target `F6A028F01F7CF0D943DB75CF88BA040F`, passed using the rebuilt definitions, the existing local connection and the actual navigator. The final observation found **150 shell ancestors**, **5,713 whole-tree fibers**, **6.9 ms** discovery and **841 ms** for 1,000 full Desktop identity checks (0.841 ms/check). The backing target reported visible. Electron reported app version `26.1002.52244`, build `13536`, App Server `0.162.0-alpha.2`; the Windows package remained `26.1002.7124.0`. The route had changed since the reported failure and was below the old 20,000 limit, so this is live contract evidence, not reproduction of that original size. The probe mounts no panes and never activates the rebuilt adapter; final installed split-workbench validation remains with the coordinating chat. Evidence and cleanup receipts are in `.artifacts/workspace-discovery-probe/`.

## Regression checks

The full repository run completed with **270 passed / 4 skipped / 0 failed** (274 tests), before the final focused refinements. Final adapter/workspace/discovery/navigation/distribution checks after the large-tree integration fix passed **98 tests / 0 failed**, saved in `.artifacts/workspace-final-adapters.log`. New workspace tests cover ticket owner/generation/single use, deactivation, exact multi-owner restoration, route rebinding, streaming/owned-mutation filtering, coalescing, semantic references, metadata-only pagination/events, shared history/listener/root reuse, signed scroll, shortcut operations, lazy-export parsing and late retirement. Hidden-document scheduling has its own check. Existing GUI code was not changed.

## Candidate packages and current registrations

Local review packages are generated by:

```text
node frontend/build.mjs
node scripts/package.mjs --output .artifacts/workspace-candidates
```

Candidate directories are `X:\codlet-plugins\.artifacts\workspace-candidates\packages\codex.ui.adapter` and `X:\codlet-plugins\.artifacts\workspace-candidates\packages\codex.desktop.adapter`. ZIPs and SHA-256 receipts are beside them in `catalog.json`. Build/package validation preserves the IDs and permission sets. Before the coordinating chat's authorized migration, the scoped CLI rejected local previews of the managed IDs with `managed_preview_required: Use a managed update preview to change a managed registration or its grants`; those historical refusals are saved in `local-preview-refusals.json`. A generated catalog's repository/tag fields are not evidence of a published release or of a successful installation of the rebuilt fix.

The coordinating chat has now installed UI 0.1.11 and Desktop 0.2.16 under their default local `packages/<id>` directories, retaining the original `packages/github` contents. The rebuilt discovery fix is delivered as source and candidates for that chat's reload, final integration and release. Formal source migration and split-workbench integration belong to the coordinating chat. Do not bypass Core's source checks by copying into `packages/github`, editing the registry, fabricating GitHub preview receipts or hiding a source change. Dependencies and existing grants must be checked before any deliberate migration.

The exact original registration/source/authorization recovery record is `X:\codlet-plugins\.artifacts\workspace-original-registrations.json`:

| Original plugin | Repository | Release / asset | SHA-256 |
| --- | --- | --- | --- |
| UI 0.1.10 | `baoabaob/codlet-ui-adapter` | release 400059473 / asset 600954287 | `0ea659c2bfbb7303d6c5cc7bfb9c8878bd4857646b2fd6570eb8d9bf5de8c5e2` |
| Desktop 0.2.15 | `baoabaob/codlet-desktop-adapter` | release 406585909 / asset 621193874 | `d4808fd1ffc082e4539af349bfa55ef2893c5fcb6684a6c6345fe8fd52e66df1` |

For the still-managed original source, supported recovery uses scoped `plugin github preview <repository-url> --release <release-id> --asset <asset-id> --update <id> --json`, followed by `plugin github update <id> <preview.path> --trust --grant <existing-permission> ... --enable --json`. Use the returned preview path and verify its digest. If a registration was deliberately migrated to a local source, restoring GitHub requires an explicit source migration: inspect the current dependency closure, retain local source files, remove/re-register through supported commands and reuse only the actual previously granted permissions. This work performs neither migration.

The acceptance runner is built with `node tests/fixtures/workspace-acceptance/build.mjs`. Its IDs are explicitly temporary `dev.workspace.audit-provider` and `dev.workspace.audit-consumer`; an additional read-only `dev.workspace.audit-observer` was used to inspect completed results without replaying a timed-out test. The follow-up discovery probe uses `node tests/fixtures/workspace-acceptance/build-discovery-probe.mjs` and temporary ID `dev.workspace.discovery-probe`. All are removed after their respective runs, preserving source/report files. Final runtime evidence for the follow-up confirms both installed local adapters retain generation 2; neither adapter was reloaded by the probe.

Platform derivation uses the actual navigator identity and Native's effective binding resolver. Windows was tested. macOS behavior is derived, not tested; the existing base adapter support remains, and unfamiliar new workspace structures fail with diagnostics.
