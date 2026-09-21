# Codlet official plugins

The development repository for first-party Codlet plugins. Source, reviews, tests and build tools stay together here. Each plugin has its own generated distribution repository and release channel. All repositories remain private during local preview development.

| Package ID | Distribution repository | Dependency |
| --- | --- | --- |
| `codex.ui.adapter` | [UI Adapter](https://github.com/baoabaob/codlet-ui-adapter) | Core renderer SDK |
| `codex.desktop.adapter` | [Desktop Adapter](https://github.com/baoabaob/codlet-desktop-adapter) | Core renderer SDK |
| `codlet-gui` | [GUI](https://github.com/baoabaob/codlet-gui) | `codex.ui.adapter` |

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

## Independent distribution

The [distribution guide](docs/DISTRIBUTION.md) describes the preparation, review and synchronization commands. A normal synchronization creates or updates private repositories and **draft** releases; it does not make repositories public. Each repository carries the `codlet-plugin` topic, its own installable ZIP, dependency links, source snapshot and reproducible build entrypoint. GitHub topic listings only show private repositories to authorized viewers; the current Codlet importer uses public GitHub releases without authentication.

Edit plugins here, not in generated repositories. To add a plugin, add its entry to `plugins.json`, its manifest and source. The shared scripts handle discovery metadata, bundling and synchronization. Version numbers remain per plugin; existing release bytes cannot be replaced.

Windows x64 local Preview is currently under acceptance. Windows ARM64 and macOS real-client acceptance remain pending. These bundles are not a public stable release.
