# Management GUI contract

`codlet-gui` is an isolated-world renderer with `ui.dom` and `runtime.manage`. Its manifest requires `codex.ui.navigation.page@1`, `codlet.runtime.ping@1` and `codlet.runtime.manage@1`. Core supplies generic management operations and enforces permissions; this repository owns their presentation and interaction. See the [Core contract index](https://github.com/baoabaob/codlet/blob/main/docs/README.md).

## Production behavior

The production entry is `frontend/src/codlet/app.jsx`, selected by `plugins.json`. It provides plugin status, text/tag search, enable/disable/reload/revoke controls, local/GitHub import review, details and source removal, plugin/runtime update status, settings, and links to the Codlet project. The Add menu opens the internal [marketplace](marketplace.md), Create plugin, and Import plugin. Marketplace discovery uses Core's paginated GitHub job; package review and installation use the existing managed import receipt path.

Create/help/review actions open an editable native task draft containing the Core skill instructions. They do not submit a turn. Removing the GUI or a dependency required by it directs the user to the CLI or a draft task instead of destroying its own review interface mid-operation.

## Mutations and review

`frontend/src/codlet/controller.js` owns state and RPC sequencing. Mutations prepare a Core-issued receipt, submit it once and query that same receipt to resolve a lost response. A stale list blocks new operations until refreshed. Closing a page cancels work not yet submitted; it does not claim an already submitted operation was undone.

Imports display the prepared package identity, permissions, dependencies, system compatibility and allowed origins before submission. Trust acknowledgment and the installation notice remain separate from package metadata. “Let Codex inspect” opens a draft review task. GitHub/local source identity, removal preview and immutable package checks remain Core responsibilities. Marketplace discovery never grants permission or infers compatibility from a repository topic.

Settings use revision checks so another window's changes are not silently overwritten. Update candidates are matched to the plugin's managed version identity. Uncertain install/update replies lead to status reconciliation, not a second install. Combined client/runtime updates remain subject to Core's operation state and confirmation.

## UI and lifetime

Use Core UI API 2's React instance, official components and owner-scoped portals. Custom React components, DOM refs, CSS and complete JavaScript remain supported. The native toolbar, menu/dialog portals, IME-aware tag completion, focus restoration, reduced motion, theme and zh/en messages are part of the existing behavior.

When `context.ui.page` exists, navigation registration remains light until the page is opened; departure disposes the page UI owner. The fallback to `context.ui.create().page()` preserves compatibility with earlier API 2 runtimes. Do not remove it without deliberately changing the supported SDK contract.

Page closure stops GUI timers and invalidates pending view replies. Deactivation also disposes manager listeners and UI ownership. This releases plugin resources but does not guarantee Chromium isolated-world destruction; see [known issues](../known-issues.md).

## Validation

Controller and GUI tests cover stale replies, receipt reuse, update reconciliation, market discovery and cancellation, review notices, task drafts, search selection, focus and teardown. `scripts/serve-gui-preview.mjs` loads the production bundle with deterministic management and market fixtures for visual review. Native routes, toolbar placement, dialogs, keyboard/IME interaction and actual install/update outcomes still require isolated real-client acceptance.
