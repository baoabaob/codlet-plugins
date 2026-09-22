# Security reporting and boundaries

Report suspected adapter or GUI security defects through [repository Issues](https://github.com/baoabaob/codlet-plugins/issues). Issues are enabled, but access and visibility follow the repository's current settings. No separate private vulnerability reporting channel is confirmed; do not assume an issue is confidential. Start with a minimal description and synthetic reproduction. If private details are necessary, ask the maintainer for a suitable channel before sharing them. Do not include credentials, conversation contents, user configuration or heap dumps containing user data.

Include the plugin version/source revision, Core revision, client build, operating system, granted permissions and whether the failure persists in an isolated test instance. This document does not promise a response SLA.

Core owns generic grants, package validation, RPC identities and Host process lifetime. This repository owns native semantic mappings, page hooks and GUI review behavior; consult the [adapter specification](docs/spec/adapters.md) and [Core documentation](https://github.com/baoabaob/codlet/blob/main/docs/README.md) when locating the boundary.

`ui.mainWorld`, `cdp.raw` and `host.process` are high-trust capabilities. Main-world ticket checks are not a sandbox against authorized arbitrary page JavaScript. The GUI must not substitute display metadata or a marketplace “official” label for Core package/permission checks. Known Chromium environment retention is documented in [known issues](docs/known-issues.md); resource cleanup does not imply forced destruction of every page world or arbitrary patch.
