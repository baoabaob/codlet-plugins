# Known issues and acceptance boundaries

## Renderer environment retention

The existing Host/Renderer architecture is retained. Repeated creation of isolated worlds in a long-lived Chromium page can retain those native environments after plugin deactivation. Releasing React roots, timers, listeners, callbacks and SDK references reduces avoidable retention but does not destroy those browser worlds. This is a known limitation, not a claim that every plugin reload is leak-free.

The GUI uses lazy page registration when available and releases its view on departure. The UI Adapter avoids scanning the whole document for ordinary streaming-text changes. Offline Node/jsdom lifecycle and scan tests continue to protect these improvements, but they cannot establish browser-world or process-memory bounds.

Ordinary `Page.reload` or document recreation is not a demonstrated remedy: the prior native pressure experiment observed context counts of 1514 before and 1516 after such reload attempts. A hard recovery requires destroying and recreating the affected WebContents/window, or restarting the client. Preserve work before recovery; a window hidden or closed to the tray may not destroy its WebContents.

Core owns the consolidated evidence and recovery boundary in its [known issues](https://github.com/baoabaob/codlet/blob/main/docs/known-issues.md). Worker and iframe experiments do not establish a production replacement ABI. No Worker execution mode, restricted UI language or automatic migration is introduced by this documentation cleanup.

## Distribution and native acceptance

Reviewed client profiles, package `platforms` metadata and actual device acceptance are different facts. A platform declaration is not a test result. Native Windows ARM64/macOS acceptance must be recorded when performed; a Windows x64 preview or loopback AppServer test does not establish those results.

The initial independent distribution rehearsal used private repositories and draft releases. It verified reproducible per-plugin source closures, archive digests, remote ownership checks and idempotent synchronization. That evidence does not establish current public release visibility or public-import acceptance. Git retains the historical receipt details; current release administration uses `dist/release-lock.json` and verified remote state.

The unauthenticated GitHub importer cannot install private repositories or draft releases. Existing local installer presets remain local sources until a separately verified migration; publishing a repository does not silently convert their source or enable GitHub auto-updates.

## Traffic activation boundaries

The Desktop Adapter's plaintext source is scoped to a newly owned, exact-version Owl main process. Its Desktop branch covers final `performDesktopFetch` HTTP/SSE calls and the upload-progress request path. Its model branch covers a verified local `codex app-server` child routed through provider base URLs for HTTP/SSE and Responses WebSocket. Native reports these as separate `activatedSources`; a working Desktop hook alone does not make model interception available.

Electron's native manual redirect mode cancels a 302 before returning a response. The Desktop source therefore follows redirects in the original Chromium session, checks each destination against the Desktop policy, and authorizes response callbacks at the tracked final origin. Intermediate 3xx bodies and redirected request hops are not plugin interception points. The local app-server provider source has its separate full HTTP/SSE/WS route and is not subject to this Desktop limit.

| Launch state | Result |
| --- | --- |
| No enabled, granted traffic consumer | Ordinary client launch; no source hook |
| Verified Desktop JS and local backend | Separate Desktop and model source activation |
| Verified Desktop JS, unsupported backend | Desktop source only; model source reported unavailable |
| All requested sources unavailable | Requested traffic launch fails closed |
| Remote/cloud backend, browser networking, attachments, Realtime/WebRTC, macOS | Coverage not established |

The old proxy/certificate route was removed. Legitimate user provider CA settings remain scoped to the private provider route. Current synthetic acceptance does not prove live OAuth refresh, enterprise workspace routing or arbitrary provider protocols. [The traffic contract](spec/traffic.md) records what each source intercepts and the permissions required for task correlation.

## Pending product work

- The marketplace interaction design is accepted; the executable preview still uses synthetic data and memory-only operations. [Its specification](spec/marketplace.md) retains the required behavior and integration gaps.
- Task-local model/provider configuration is available through `codex.backend.write@1` at thread start/resume; a hook that opts into `turn.start` can also select the model for each turn. Provider changes remain limited to thread start/resume. Live OAuth and uncovered network paths need separate owned-device acceptance. See the [adapter contract](spec/adapters.md).
- Full native UI behavior and installer acceptance must be checked on the final integrated source, not inferred from this repository's offline suite.
