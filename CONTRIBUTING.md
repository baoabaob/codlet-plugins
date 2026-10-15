# Contributing

Develop and review official plugins in this repository. Follow [development and testing](docs/development.md), update the relevant [current specification](docs/README.md), and rebuild checked-in renderer bundles after source changes. Generated distribution repositories are outputs; changes made there are not merged back automatically.

Core owns the Codex implementation, Native profiles, probes and SDK declarations. Send changes to those contracts to [Core](https://github.com/baoabaob/codlet); this repository owns the GUI and functional acceptance consumer. Historical Adapter distribution repositories are not development entry points.

Report ordinary defects in [repository Issues](https://github.com/baoabaob/codlet-plugins/issues). Include the plugin version, Core revision, reviewed client build, operating system and a minimal reproduction. Follow [security reporting](SECURITY.md) for suspected permission, identity or isolation failures.

Unless explicitly stated otherwise, contributions intentionally submitted for inclusion are provided under [Apache-2.0](LICENSE). Preserve existing third-party licenses and attribution notices; do not relabel dependency code as original Codlet code.
