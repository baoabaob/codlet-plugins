# Documentation

This repository owns Codex-specific behavior and official plugin UX. Generic plugin manifests, lifecycle, permissions, RPC, Host, UI SDK and Core management contracts belong to the [Core documentation](https://github.com/baoabaob/codlet/blob/main/docs/README.md). Do not create a second generic runtime specification here.

| Document | Responsibility |
| --- | --- |
| [Adapters](spec/adapters.md) | Native navigation, Desktop semantic capabilities, trust and compatibility |
| [Traffic Adapter](spec/traffic.md) | Consumer-owned interception, backend/Electron integration and coverage limits |
| [GUI](spec/gui.md) | Production management behavior and UI lifecycle |
| [Marketplace](spec/marketplace.md) | Production discovery, metadata, installation review and preview tools |
| [Development](development.md) | Contributions, clean builds, tests and previews |
| [Distribution](publishing.md) | Package provenance, independent repositories and release rules |
| [Known issues](known-issues.md) | Current limitations and evidence boundaries |

The manifests in `bundled/`, `plugins.json`, `compatibility/client-profiles.json`, source and regression tests define current behavior. Update the relevant specification when behavior changes. Historical design iterations and retired implementation details remain in Git history, not in parallel archived documents.
