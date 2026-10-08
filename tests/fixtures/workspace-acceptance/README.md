# Current-instance workspace acceptance

Build with `node tests/fixtures/workspace-acceptance/build.mjs`. This prepares two explicit local test packages under ignored `.artifacts/workspace-acceptance/`; it does not replace official adapters or install anything automatically.

The provider reuses the production discovery, workspace and metadata projector. It preloads base navigation as the production adapter does, but injects no page or composer action. The consumer acquires a real Core-authenticated ticket, creates owned slots/leases/transcripts/shortcuts, records native commit completion and restores its settings navigation. Its Host uses only Core-owned CDP sessions; no second backend connection is created. The script records quantitative content presence and metadata, not message text or credentials.

Preview both directories using the running Core's `runtime.json.cliScript`. Register the provider with `ui.dom` and `ui.mainWorld`, then the consumer with those plus `host.process` and `cdp.raw`, only within an authorized acceptance run. Keep official adapter IDs, directories, source and grants intact. Read the consumer's `report.json`; inspect an existing run rather than replaying uncertain operations. Remove consumer before provider through scoped CLI, retaining report/source files and without forcing deletion or unrelated cascading.

See [the current evidence and limitations](../../../docs/spec/workspace-review.md). This fixture targets a real Windows client; it is not a normal CI test or a macOS acceptance claim.

## Read-only discovery regression probe

After `node frontend/build.mjs`, run `node tests/fixtures/workspace-acceptance/build-discovery-probe.mjs`. Preview the generated `.artifacts/workspace-discovery-probe` directory through the scoped CLI, then register its temporary `dev.workspace.discovery-probe` ID with `host.process` and `cdp.raw` for an authorized diagnostic run. Read `report.json` and remove that ID through the scoped CLI when done.

This probe evaluates only the rebuilt adapter's definitions and its read-only connection/navigation discovery in Core-owned page sessions. It calls neither `activate` nor `createAdapter`: it does not replace installed APIs, patch transports, mount panes, change routes, reload an adapter or open a backend connection. It counts the old whole-tree boundary up to 20,001 fibers without reading message props, measures the bounded native-shell ancestry and 1,000 connection checks, and preserves errors per target. A current tree below the old limit does not reproduce the original long-session failure; the 72,008-fiber, three-pane regression fixture covers that case deterministically.
