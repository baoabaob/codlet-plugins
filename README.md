# Codlet official plugins

Source for ordinary first-party Codlet plugins and the complete functional acceptance consumer. [Codlet Core](https://github.com/baoabaob/codlet) owns the UI/Desktop implementations, Native profiles and `context.codex` SDK. The **1.0.0-rc.1** candidate remains local and unpublished.

| Package ID | Distribution repository | Dependency |
| --- | --- | --- |
| `codlet-gui` | [GUI](https://github.com/baoabaob/codlet-gui) | Core SDK |

Develop the GUI here. The separate GUI repository is a reproducible distribution output. The former Adapter sources, Native tools and duplicated types have been removed from this working tree; their maintained copies and [historical records](https://github.com/baoabaob/codlet/blob/main/docs/history/adapters/README.md) are in Core. Old Adapter tags and Release downloads remain unchanged. No separate Adapter installation is required for Core v1.

Build and package with Node 24 and the locked npm dependencies:

```text
npm ci --prefix frontend
node frontend/build.mjs
node scripts/package.mjs --output .artifacts/gui-v1
```

For SDK-dependent tests, first build the matching Core checkout, then prepare an explicit snapshot:

```text
node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT
node --test tests/*.test.mjs
```

The snapshot contains Core UI, page and i18n bundles in ignored `.core-sdk/`. An optional second absolute argument selects another fresh snapshot directory; set `CODLET_CORE_SDK_ROOT` to use it in tests and previews. GUI build/package does not need a sibling Core checkout.

The selected fresh package output contains the GUI ZIP and a catalog with hashes. Existing output is never overwritten. Core installers offer only the optional GUI. The [complete functional test consumer](tests/fixtures/runtime-compatibility/consumer/README.md) has a separate packaging command and is never an installer default.

## Development and contracts

- [Documentation map](docs/README.md), [development and tests](docs/development.md), [publishing](docs/publishing.md).
- [Known limits](docs/known-issues.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md).
- [Core repository ownership](https://github.com/baoabaob/codlet/blob/main/docs/repository-layout.md) and [SDK contracts](https://github.com/baoabaob/codlet/blob/main/docs/README.md).

Add ordinary plugins through `plugins.json`; an installer preset is a separate product decision. Rebuild generated renderer bundles from their checked-in source. Never replace bytes under an existing release version.

The [marketplace](docs/spec/marketplace.md) is part of the production GUI. It discovers public GitHub plugin repositories and sends selected packages through Core review. SDK declarations, publisher exclusions, runtime capability probes and actual Native verification are separate claims.

## License

Codlet official plugins are licensed under [Apache-2.0](LICENSE); see [NOTICE](NOTICE). Third-party dependency licenses remain unchanged. Independently developed plugins need not use Apache-2.0.
