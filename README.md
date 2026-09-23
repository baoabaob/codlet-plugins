# Codlet official plugins

The source repository for first-party Codlet plugins. Codex-specific adapters and the management GUI live here; the [Codlet Core](https://github.com/baoabaob/codlet) repository owns the runtime, generic SDK, permissions and installers. Each plugin has an independent generated distribution repository and release channel.

| Package ID | Distribution repository | Dependency |
| --- | --- | --- |
| `codex.ui.adapter` | [UI Adapter](https://github.com/baoabaob/codlet-ui-adapter) | Core renderer SDK |
| `codex.desktop.adapter` | [Desktop Adapter](https://github.com/baoabaob/codlet-desktop-adapter) | Core renderer SDK |
| `codlet-gui` | [GUI](https://github.com/baoabaob/codlet-gui) | `codex.ui.adapter` |

These are ordinary plugins with explicit manifests and permissions. Core does not embed their code. The Core-provided runtime skill and CLI remain usable without the GUI.

Build and package with Node 24 and the locked npm dependencies:

```text
npm ci --prefix frontend
node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT
node frontend/build.mjs
node scripts/package.mjs
```

Run the plugin suite against the SDK built from the matching Core checkout:

```text
node --test tests/*.test.mjs
```

`dist/` contains one versioned ZIP per plugin and a catalog with file hashes. Packaging does not execute plugins or publish a release. Local installers consume this same catalog. The UI and Desktop adapters maintain their own reviewed client profiles in `compatibility/`.
`prepare-core-sdk.mjs` also refreshes the tracked generic Desktop source client in `host/vendor/`; the generated distribution keeps this dependency so its build remains self-contained.

## Development and contracts

- [Documentation map](docs/README.md): current contracts and ownership.
- [Contributing and testing](docs/development.md): clean checkout setup, fixtures, previews and validation.
- [Distribution](docs/publishing.md): prepare and review independent packages; publishing is a separate explicit operation.
- [Known issues](docs/known-issues.md): renderer environment retention and acceptance limits.
- [Contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md).

Edit plugins here, not in generated repositories. Add packages through `plugins.json`; change installer presets only as a separate product decision. Keep generated renderer bundles reproducible from their checked-in sources. Do not replace bytes under an existing release version.

The [marketplace specification](docs/spec/marketplace.md) records an accepted interaction design and its executable preview. It is not yet connected to the production GUI or a live catalog. Package platform declarations, reviewed client profiles and native device acceptance are separate claims.

## License

Codlet official plugins are licensed under [Apache-2.0](LICENSE); see [NOTICE](NOTICE) for attribution. Third-party dependencies retain their own licenses and notices. This license choice does not require independently developed third-party Codlet plugins to use Apache-2.0.
