# Codlet official plugins

The source repository for ordinary first-party Codlet plugins and the complete functional test consumer. For the **1.0.0-rc.1** candidate, [Codlet Core](https://github.com/baoabaob/codlet) owns the imported UI/Desktop implementations and the `context.codex` SDK. The management GUI stays an ordinary independently packaged plugin. This candidate has not been publicly released.

| Package ID | Distribution repository | Dependency |
| --- | --- | --- |
| `codlet-gui` | [GUI](https://github.com/baoabaob/codlet-gui) | Core Codex SDK |

The legacy UI/Desktop Adapter sources, profiles and regression fixtures remain here for provenance and old releases. They are excluded from new package/distribution output; maintained implementation changes belong under Core's `codex/`. Existing Adapter registrations and data are preserved by Core without running duplicate providers. The Core-provided runtime skill and CLI remain usable without the GUI.

Build and package with Node 24 and the locked npm dependencies:

```text
npm ci --prefix frontend
node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT
node frontend/build.mjs
node scripts/package.mjs --output .artifacts/gui-v1
```

Run the plugin suite against the SDK built from the matching Core checkout:

```text
node --test tests/*.test.mjs
```

The selected fresh output contains the GUI ZIP and a catalog with file hashes. Existing output is never overwritten. Packaging does not execute plugins or publish a release. Core installers offer only the optional GUI. The complete migrated [functional test plugin](tests/fixtures/runtime-compatibility/consumer/README.md) has a separate fixture packaging command and never becomes an installer default.
`prepare-core-sdk.mjs` also refreshes the Desktop source client used by retained legacy regression fixtures. This is not a second maintained v1 Adapter release.

## Development and contracts

- [Documentation map](docs/README.md): current contracts and ownership.
- [Contributing and testing](docs/development.md): clean checkout setup, fixtures, previews and validation.
- [Distribution](docs/publishing.md): prepare and review independent packages; publishing is a separate explicit operation.
- [Known issues](docs/known-issues.md): renderer environment retention and acceptance limits.
- [Contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md).

Edit plugins here, not in generated repositories. Add packages through `plugins.json`; change installer presets only as a separate product decision. Keep generated renderer bundles reproducible from their checked-in sources. Do not replace bytes under an existing release version.

The [marketplace](docs/spec/marketplace.md) is integrated into the production GUI. It discovers public GitHub plugin repositories, shows matched publisher release declarations, and sends the selected ZIP through Core's package and permission review before installation. Search follows public repository names, descriptions and tags; missing or incomplete declarations leave compatibility and download statistics unknown. SDK compatibility, explicit author exclusions, runtime capability probes and actual Native verification are separate claims.

## License

Codlet official plugins are licensed under [Apache-2.0](LICENSE); see [NOTICE](NOTICE) for attribution. Third-party dependencies retain their own licenses and notices. This license choice does not require independently developed third-party Codlet plugins to use Apache-2.0.
