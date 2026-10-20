# 独立分发与发布契约

`codlet-plugins` 是普通官方插件的开发入口。Core v1 统一维护 Codex 实现、Native profiles 和 SDK，消费者通过 `context.codex` 使用。`plugins.json` 只列出 `codlet-gui`；构建、打包和分发准备器不再包含 Adapter/Native Host 分支。两个旧 Adapter 分发仓库保留历史标签和 Release，当前源码与回归归 Core 维护。GUI 的独立分发仓库保存自己的 topics、版本标签和 Release ZIP。

发布输入必须是已测试的源码提交、实际安装包和使用固定发布密钥签名的更新清单。

## 日常流程

按照 [开发与测试说明](development.md) 在本仓库修改并验证插件。先构建、打包，提交源码和生成的 bundle，再准备待同步内容：

```powershell
npm ci --prefix frontend
node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT
node frontend/build.mjs
node scripts/package.mjs --signing-key ABSOLUTE_PRIVATE_KEY_PATH
# 运行与修改相关的插件测试并提交；准备器会拒绝未提交的源文件
node scripts/distribution.mjs
powershell -NoProfile -File scripts/Sync-Distribution.ps1
```

`dist/` 必须是本次发布专用的空打包目录，打包器拒绝覆盖已有内容。保留旧版本制品和发布回执；本地检查可用 `node scripts/package.mjs --output ABSOLUTE_FRESH_OUTPUT`。CLI 分发准备器默认读取 `dist/`；其程序接口 `prepareDistribution(root,{outputDirectory})` 可检查另一输出目录。最后一行仅检查文件、输出同步计划，不联网。`node scripts/distribution.mjs --allow-dirty` 可用于本地检查，但这样的计划不能同步到 GitHub。

确认计划后，同步到已公开的分发仓库，生成草稿 Release 并上传经过校验的插件 ZIP、`codlet-release.json` 和 `codlet-updates.json`：

```powershell
powershell -NoProfile -File scripts/Sync-Distribution.ps1 -Apply -AllowPublic
```

脚本使用 Git Credential Manager 中现有的 GitHub 凭据，或 `CODLET_DISTRIBUTION_TOKEN` / `GH_TOKEN`。凭据只存在于内存，不写进文件、计划、Git 配置或日志；网络继承系统代理。需要创建仓库、设置 topics 和写入内容的权限。组织名不属于当前账户时，请先创建组织内私有空仓库，脚本不会代替用户修改组织权限。

`dist/release-lock.json` 保存同步回执，含每个插件的仓库、版本、源提交、Release ID、ZIP、声明和更新清单的 asset ID、文件名、SHA-256、大小及 private/draft 状态。重新执行会复用已完成的步骤和未变化的版本，不重复发版。

## 签名更新清单

所有插件遵循 Core 的[更新清单契约](https://github.com/baoabaob/codlet/blob/main/docs/spec/plugin-updates.md)。
`scripts/prepare-core-sdk.mjs` 同时准备通用发布工具，打包器调用该工具生成签名。
ZIP 内的 `codlet-update.json` 记录固定清单地址和 Ed25519 公钥；Release 中的
`codlet-updates.json` 记录插件 ID、版本、下载直链、实际大小、SHA-256 和签名。
客户端根据已安装公钥验证清单并下载文件。

首次发布时用 Core 的 `scripts/plugin-release.mjs keygen` 生成私钥，存放在源码、
包目录和 `dist/` 之外，将对应公钥记入 `publishing/update-keys.json`。
后续版本沿用同一私钥，使用 `--signing-key` 或 `CODLET_PLUGIN_SIGNING_KEY` 指定。
打包器拒绝与已记录公钥不符的私钥；准备器和同步器再次验证清单、签名及实际 ZIP。

`--fixture` 仅用于自动化测试，可以在内存中生成临时密钥；产物和计划带有 fixture
标记，发布同步器与 Core 安装包构建器会拒绝它们。

`plugins.json.updateManifestUrl` 使用 `codlet-updates` 分支上的固定 raw 文件地址。
同步器在全部资产上传并确认 Release 已发布后，合并该频道中的签名条目，保留每个
插件的最新正式版和预览版。草稿不会推进频道；相同内容不会重复提交，并发修改由
文件 SHA 条件检查拒绝。默认源码分支和频道分支分开，版本化 Release 资产保持不变。
这让预览版本也能被检查到，不依赖会跳过预览版的 GitHub `latest` 路由。

## Release 声明资产

每个独立 Release 同时包含恰好一个 `${plugin.id}-${plugin.version}.zip`、一个
`codlet-release.json` 和一个 `codlet-updates.json`。`codlet-release.json` 提供市场
展示元数据，签名验证由 `codlet-updates.json` 承担。Core 安装时仍检查 ZIP 内的
manifest、实际文件、摘要、权限和依赖。下载统计只对应插件 ZIP。

`codlet-release.json` 的 schema 为 `{schema:1,kind:"codlet-plugin-release",manifest,metadata,asset}`。`manifest` 是 ZIP 中完整的 `codlet.json` 对象，`metadata` 是 ZIP 中完整的 `codlet-package.json` 对象；`asset` 精确记录 ZIP 文件名、字节数和 64 位小写 SHA-256。

打包器从两个包内 JSON 和 ZIP 实际字节生成声明。准备器核对声明、SDK API 1、能力列表与 manifest 的一致性、目录快照、ZIP 文件名/大小/摘要，并从当前源码重建 renderer 比较字节后写入同步计划。Native profile 由 Core 维护，不再是 GUI 独立分发的输入。同步器先核对远端同名资产；已存在资产必须是 `uploaded` 状态且大小与 GitHub `sha256:` digest 匹配。草稿只补齐缺失资产；任何同版本字节不同或已发布版本缺少资产都会停止，不会覆盖。

当前标准 SDK 包元数据包含 `runtimeApi:1` 与 `sdk:{api:1,capabilities:[...]}`，重点说明 SDK/能力契约，不以作者的平台表代替统一适配。`runtimeApi` 仍是执行 ABI 1。显式系统或 Native 例外可保留作者的 `platforms`、客户端 profile、限制说明；静态 profile 不代表真机通过。

可选 `verification` 记录使用 `{kind:'automated'|'native',platform?,clientVersion?,status:'passed'|'failed'|'notRun',evidence?}`，必须标明它是作者提供的证据。导入器检查声明结构、来源与 ZIP 摘要，不认证作者测试结果；SDK 声明匹配也不证明当前客户端所有能力可用。历史 Native 记录和当前候选测试应分别列出，实际边界继续记录在 [已知限制](known-issues.md)。

## 什么会同步

- `codlet.json`、编译后的 renderer、包元数据、README：既能作为插件目录检查，也有适合 GitHub 导入的 Release ZIP
- 当前插件的实际源码依赖、图片/样式资源、锁定的 npm 依赖和独立构建脚本
- `.codlet-distribution.json`：开发提交、包摘要和文件清单，用于溯源和检查手工修改
- `LICENSE` 与 `NOTICE`：官方插件采用 Apache-2.0；第三方依赖自身的许可/归属仍随 bundle 保留，独立第三方插件不因此被要求采用 Apache-2.0
- `codlet-plugin`、`codlet-official` 及对应功能 topics

生成仓库可以独立运行 `npm ci --prefix frontend`、`node frontend/build.mjs`。不要使用 GitHub 自动生成的 Source code ZIP 安装插件，它包含开发目录；使用明确上传的插件 ZIP。v1 GUI 依赖 Core SDK，没有外部 Adapter 依赖。其它插件声明的外部依赖仍需显式安装，导入器不自动获取它们。

分发仓库的直接修改会中止同步，先把改动合回开发仓库。脚本不会 force push，不移动旧标签，不覆盖已有资产，也不会把私有仓库改成公开。同步期间远端分支发生变化时同样停止。

## 新增插件和独立版本

在 `plugins.json` 增加 ID、bundle 目录、入口、分发仓库、说明、topics 和依赖；同时添加普通 `codlet.json` 与插件源码。修改某插件后，只调整它的版本。版本由 manifest 提供，同步器拒绝用同一标签替换已发布或已有草稿的内容。共享源码导致多个插件发生变化时，这些插件都应调整版本。

`installerPlugins` 标记初始设置中的外部插件，目前只有 GUI；打包器生成其 ZIP 和 catalog。Core 自带 Codex 实现与 SDK。Core 保留用户已有的 Adapter 注册、安装文件、偏好、授权和数据，同时阻止重复 provider；这与从开发仓库移除重复实现是不同的操作。`compatibility/official-sources.json` 中的旧仓库身份仍供来源识别和 GUI 排除旧包使用，不是待发布清单。增加普通插件不会自动增加安装器勾选项。

## 可见性与来源迁移

既有仓库的可见性不授权新发布。当前同步计划只包含 `plugins.json.plugins` 中的 GUI。默认 `-Apply` 只生成草稿；公开目标还须指定 `-AllowPublic`。未认证的 GitHub 导入器不能安装私有或草稿 Release。旧 Adapter 仓库可在替代 Core 发布可用后设为只读归档，保留下载地址；目录整理本身不改变远端状态。

核对草稿后使用 `-Apply -AllowPublic -Publish` 发布。新增分发仓库仍默认私有，需要另外调整可见性；脚本本身不改可见性。仓库仍为私有时 `-Apply -Publish` 只会发布私有 Release，不会让导入器获得访问凭据。

通过 GitHub 安装的插件，更新来源就是自己的分发仓库，现有 Core 的单插件 Release 检查可以直接使用。Core 安装器只携带下载选项与来源身份，首次设置通过普通 CLI 从各自 GitHub 仓库获取最新正式插件 Release。因此必须先发布可用的插件 Release，再交付依赖该修复的新安装体验；只推送源码不算可供下载安装。

**旧安装器留下的本地来源不会被伪装为 GitHub 安装。** 新安装从第一次下载起就是普通 GitHub 插件。 用户可在 GUI 或 CLI 中预览并确认切换到对应 GitHub Release；Core 会核对安装器回执与完整文件集，并保留启停偏好和已有授权，新增权限仍需确认。自定义或改动过的目录不会自动替换。仓库同步本身不修改正在运行的插件注册，完整流程见 [Core 管理契约](https://github.com/baoabaob/codlet/blob/main/docs/spec/management.md)。

## 检查

```powershell
node --test tests/distribution.test.mjs
powershell -NoProfile -File tests/distribution.ps1
```

另外对当前计划中的每个生成目录执行独立构建，比较 bundle 的 SHA-256；同步后核对可见性、topics、标签、草稿状态以及 ZIP 与声明 JSON 两个 GitHub 返回的资产 digest，再执行一次同步确认幂等。旧 Adapter 仓库不因 v1 常规 GUI 分发而被改写。

历史演练已验证独立重建、摘要、远端所有权与重复同步；结果范围见 [已知限制](known-issues.md)。重新发布仍必须验证当前提交和当前远端，不能以旧回执代替。
