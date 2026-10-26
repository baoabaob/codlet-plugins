# Known issues and acceptance boundaries

## Current Core integration

The GUI and complete functional consumer use Core's `context.codex` SDK and explicit state hooks. Current Windows integration is recorded in [Core rc.19 validation](https://github.com/baoabaob/codlet/blob/main/docs/releases/1.0.0-rc.19/validation.md). The [first v1 candidate record](https://github.com/baoabaob/codlet/blob/main/docs/releases/1.0.0-rc.1/validation.md) retains its original package identities and isolated Windows Native evidence.

SDK declarations, runtime availability and verified platform behavior are different claims. Native DOM/main-world access and raw Node remain trusted-code boundaries. Whole-Core restoration transfers settled JSON; an active functional test rejects checkpointing so its effects are not replayed.

## Renderer lifetime

Repeated isolated-world creation can retain Chromium environments after plugin deactivation. The GUI releases its page, roots, listeners and callbacks, but that cannot destroy the underlying browser worlds. Offline Node/jsdom checks do not prove Native memory bounds. [Core's current known issues](https://github.com/baoabaob/codlet/blob/main/docs/known-issues.md) owns the measurements and recovery guidance.

## Marketplace and distribution

The marketplace searches public repository names, descriptions and topics. Manifest tags without a matching topic are not globally searchable. Missing release declarations leave compatibility or download totals unknown. The local preview uses synthetic responses.

Unauthenticated import cannot install private repositories or draft Releases. Installer-origin migration and local-to-GitHub source switching use Core's explicit review; an unrelated author directory is not enrolled automatically. Old Adapter downloads are retained for older installations but are excluded from the v1 publisher plan.

Package declarations and successful rebuilding do not establish native GUI, physical input, clean-device installation, macOS or ARM64 acceptance. Validate the actual integrated source and platform before adding such evidence.

## Historical evidence

Earlier client profiles, Adapter releases, traffic acceptance and distribution rehearsals have moved to [the Adapter archive](https://github.com/baoabaob/codlet/blob/main/docs/history/adapters/known-issues.md). Their original versions and limits remain intact. Current traffic and permission semantics belong to the [Core SDK](https://github.com/baoabaob/codlet/blob/main/docs/spec/codex.md) and [traffic contract](https://github.com/baoabaob/codlet/blob/main/docs/spec/traffic.md).
