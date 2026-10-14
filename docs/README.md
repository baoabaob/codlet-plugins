# Documentation

This repository owns ordinary official plugin UX and the complete functional test consumer. Core v1 owns the imported Codex integration and its semantic SDK. Manifests, lifecycle, permissions, RPC, Host, UI/Codex SDK and management contracts belong to the [Core documentation](https://github.com/baoabaob/codlet/blob/main/docs/README.md). Retained Adapter documents below record API compatibility and provenance; they do not instruct v1 users to install separate providers.

| Document | Responsibility |
| --- | --- |
| [Adapters](spec/adapters.md) | Native navigation, Desktop semantic capabilities, trust and compatibility |
| [Workspace API](workspace-api.md) | Owner-scoped surfaces, native transcripts, slots and shortcuts |
| [Workspace review](spec/workspace-review.md) | Current native acceptance, performance, candidates and recovery |
| [Traffic Adapter](spec/traffic.md) | Consumer-owned interception, backend/Electron integration and coverage limits |
| [Windows startup research](spec/windows-startup-bootstrap.md) | Validated replacement entry prototype, measured cost and work before shipping |
| [GUI](spec/gui.md) | Production management behavior and UI lifecycle |
| [Marketplace](spec/marketplace.md) | Production discovery, metadata, installation review and preview tools |
| [Development](development.md) | Contributions, clean builds, tests and previews |
| [Distribution](publishing.md) | Package provenance, independent repositories and release rules |
| [Known issues](known-issues.md) | Current limitations and evidence boundaries |

The GUI manifest, `plugins.json`, source and regression tests define ordinary plugin behavior. `legacyAdapters` excludes the preserved Adapter sources from current packages. Maintained Core compatibility profiles now live under Core's `codex/compatibility`; historical Native evidence retains its original version and scope.
