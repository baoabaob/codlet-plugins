# Independent distribution acceptance — 2026-09-21

Three private distribution repositories were generated from development commit
`7c7ae8e528fe8c9a0ae719803500b1bba01d662d` and verified through GitHub's API.
All releases are drafts, with tag `v0.1.0`; no repository was made public.

| Plugin | Repository | Commit | Release / asset IDs |
| --- | --- | --- | --- |
| UI Adapter | `baoabaob/codlet-ui-adapter` | `95874bdbd73579544a7a61b4355d5eb87d5ae78a` | `392795206` / `578605346` |
| Desktop Adapter | `baoabaob/codlet-desktop-adapter` | `cb458c4ecde2600736310158e4ce37ecd9308ca8` | `392795408` / `578606116` |
| GUI | `baoabaob/codlet-gui` | `4082397bb26880ea8ec0cc9f5896ad8b5cf68037` | `392795694` / `578606872` |

Checks completed:

- Each generated repository built independently using its own pinned npm
  dependencies. The resulting renderer bytes matched the development bundle
- Local preparation tests checked isolated source closures, manifests, archive
  hashes, Git blob identities, unique destinations and traversal rejection
- Publisher tests rejected manually edited files, additional files, symlinks,
  truncated remote trees and a mismatched development owner
- Actual repository visibility, expected topics, version tags, draft state and
  one ZIP asset per plugin were read back from GitHub
- GitHub asset digests matched the local SHA-256 values
- A second synchronization reused all three commits, release IDs and asset IDs
- Core assembled the three independent plugin packages and verified its payload
  manifest. A catalog containing a fourth non-preset plugin still produced only
  the three configured installer presets

No running plugin registration was changed. These private draft releases were
not installed through the unauthenticated public GitHub importer. Public release
installation and migration of existing local presets still need acceptance when
those channels become publicly available.

Local evidence is retained in `.artifacts/distribution-verification.json` and
`dist/release-lock.json`; neither contains credentials. The installer catalog
also records the independent repository and tag for each preset.
