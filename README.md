# Codlet official plugins

Independent source and release packages for the first-party Codlet plugins. This repository is private during local preview development.

| Package ID | Purpose | Dependency |
| --- | --- | --- |
| `codex.ui.adapter` | Native sidebar and plugin page integration | Core renderer SDK |
| `codex.desktop.adapter` | Desktop task, backend, approval and transport integration | Core renderer SDK |
| `codlet-gui` | Plugin and Codlet management | `codex.ui.adapter` |

These are ordinary plugins with explicit manifests and permissions. Core does not embed their code. The Core-provided runtime skill and CLI remain usable without the GUI.

Build using pinned Node 24:

```text
npm ci --prefix frontend
node frontend/build.mjs
node scripts/package.mjs
```

Run the full plugin suite against the SDK built from the matching Core checkout:

```text
node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT
node --test tests/*.test.mjs
```

`dist/` contains one versioned ZIP per plugin and a catalog with file hashes. Packaging does not execute plugins or publish a release. Local installers consume this same catalog. The UI and Desktop adapters maintain their own reviewed client profiles in `compatibility/`.

Windows x64 local Preview is currently under acceptance. Windows ARM64 and macOS real-client acceptance remain pending. These bundles are not a public stable release.
