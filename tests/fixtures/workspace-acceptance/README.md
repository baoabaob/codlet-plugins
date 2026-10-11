# Workspace acceptance fixtures

The Native probes below document earlier acceptance runs. Any new runtime run must target its own independent Codlet test client and synthetic conversations, with verified run/profile/registry/PID/Target and backend/home ownership. Historical Target IDs, real conversation lists and an arbitrary first page cannot select that run. Creating a second window alone does not establish data isolation. These fixtures do not run automatically during build or CI.

Build with `node tests/fixtures/workspace-acceptance/build.mjs`. This prepares two explicit local test packages under ignored `.artifacts/workspace-acceptance/`; it does not replace official adapters or install anything automatically.

The provider reuses the production discovery, workspace and metadata projector. It preloads base navigation as the production adapter does, but injects no page or composer action. The consumer acquires a real Core-authenticated ticket, creates owned slots/leases/transcripts/shortcuts, records native commit completion and restores its settings navigation. Its Host uses only Core-owned CDP sessions; no second backend connection is created. The script records quantitative content presence and metadata, not message text or credentials.

Preview both directories using the running Core's `runtime.json.cliScript`. Register the provider with `ui.dom` and `ui.mainWorld`, then the consumer with those plus `host.process` and `cdp.raw`, only within an authorized acceptance run. Keep official adapter IDs, directories, source and grants intact. Read the consumer's `report.json`; inspect an existing run rather than replaying uncertain operations. Remove consumer before provider through scoped CLI, retaining report/source files and without forcing deletion or unrelated cascading.

See [the current evidence and limitations](../../../docs/spec/workspace-review.md). This fixture targets a real Windows client; it is not a normal CI test or a macOS acceptance claim.

## Read-only discovery regression probe

After `node frontend/build.mjs`, run `node tests/fixtures/workspace-acceptance/build-discovery-probe.mjs`. Preview the generated `.artifacts/workspace-discovery-probe` directory through the scoped CLI, then register its temporary `dev.workspace.discovery-probe` ID with `host.process` and `cdp.raw` for an authorized diagnostic run. Read `report.json` and remove that ID through the scoped CLI when done.

This probe evaluates only the rebuilt adapter's definitions and its read-only connection/navigation discovery in Core-owned page sessions. It calls neither `activate` nor `createAdapter`: it does not replace installed APIs, patch transports, mount panes, change routes, reload an adapter or open a backend connection. It counts the old whole-tree boundary up to 20,001 fibers without reading message props, measures the bounded native-shell ancestry and 1,000 connection checks, and preserves errors per target. A current tree below the old limit does not reproduce the original long-session failure; the 72,008-fiber, three-pane regression fixture covers that case deterministically.

## Distinct cold transcripts

Build with `node tests/fixtures/workspace-acceptance/build-cold-probe.mjs` and preview/register the generated temporary `dev.workspace.cold-probe` package through the scoped CLI. Its permissions are `ui.dom`, `ui.mainWorld`, `host.process`, `cdp.raw`. It selects six different cached tasks that are unselected, `needs_resume` and have no stream role: two use the original implementation from commit `bb727175`, four use the current implementation. It mounts owned offscreen containers, records readiness/body lengths/history methods and before/after stream state, and disposes all roots. It sends no messages, changes no route and replaces no installed adapter API. Retain `report.json`, then remove the temporary ID.

## Native navigation receipts

Build with `node tests/fixtures/workspace-acceptance/build-navigation-probe.mjs`. Preview/register `dev.workspace.navigation-probe-provider` with `ui.dom`/`ui.mainWorld`, then `dev.workspace.navigation-probe-consumer` with `ui.mainWorld`/`host.process`/`cdp.raw`. The consumer invokes a temporary capability through Core RPC; the provider uses the exact internal `createThreadOpener` used by Desktop, the existing local manager and the actual native router. It installs no transport interceptor and leaves official adapter symbols untouched.

Run the read-only alternate probe first to preserve tree evidence. Navigation acceptance requires a local selected route and two other already-resumed owner tasks. It measures receipt latency and metadata reads, then restores the original selected route. If those prerequisites are absent it records read-only control RPC timing and performs no navigation. Results are in the consumer's `report.json`; retain completed navigation reports before a control-only run. Remove the consumer, then provider through the scoped CLI. The two modes measure RPC receipt completion, not Native paint completion or a universal latency bound.

## Offline Adapter wrapper matrix

Run `node tests/fixtures/workspace-acceptance/bench-wrapper.mjs`. It bundles the Adapter into a React/jsdom fixture, uses only synthetic thread identities, and writes `.artifacts/workspace-wrapper-benchmark/report.json`. No client, Core registration or backend is used. The report records its source bundle hash, runId, Node version and explicit `nativeClientTested:false` / `nativeDraftHandoffTested:false` fields.

Cases cover 0/1/2/4/5/8 transcript roots, 200 streaming mutations, five bursts of 40 shell mutations, ResizeObserver subscription churn and complete teardown. A separate fake composer driver samples warm binding/state transitions. Its timing is only protocol overhead, not Native editor readiness or paint latency. A settled microtask count is not a sustained idle CPU measurement. See [the agreed Native contract and remaining acceptance work](../../../docs/spec/workspace-composer-contract.md).
