# 集中开发与独立分发

`codlet-plugins` 是官方插件的开发入口，集中管理源码、组件依赖、构建与测试。`codlet-ui-adapter`、`codlet-desktop-adapter`、`codlet-gui` 是自动生成的独立分发仓库。每个仓库只有一个插件，具备自己的 topic、版本标签和 Release ZIP。Core 仓库继续保留运行时与 SDK，不重新引入官方插件源码。

## 日常流程

安装开发依赖后，在本仓库修改和测试插件。先构建、打包，提交源码和生成的 bundle，再准备待同步内容：

```powershell
npm ci --prefix frontend
node frontend/build.mjs
node scripts/package.mjs
# 运行与修改相关的插件测试并提交；准备器会拒绝未提交的源文件
node scripts/distribution.mjs
powershell -NoProfile -File scripts/Sync-Distribution.ps1
```

最后一行仅检查文件、输出同步计划，不联网。`node scripts/distribution.mjs --allow-dirty` 可用于本地检查，但这样的计划不能同步到 GitHub。

确认计划后，同步所有插件到私有仓库，生成草稿 Release 并上传经过校验的 ZIP：

```powershell
powershell -NoProfile -File scripts/Sync-Distribution.ps1 -Apply
```

脚本使用 Git Credential Manager 中现有的 GitHub 凭据，或 `CODLET_DISTRIBUTION_TOKEN` / `GH_TOKEN`。凭据只存在于内存，不写进文件、计划、Git 配置或日志；网络继承系统代理。需要创建仓库、设置 topics 和写入内容的权限。组织名不属于当前账户时，请先创建组织内私有空仓库，脚本不会代替用户修改组织权限。

`dist/release-lock.json` 保存同步回执，含每个插件的仓库、版本、源提交、Release ID、asset ID、文件名、SHA-256、大小及 private/draft 状态。重新执行会复用已完成的步骤和未变化的版本，不重复发版。

## 什么会同步

- `codlet.json`、编译后的 renderer、包元数据、README：既能作为插件目录检查，也有适合 GitHub 导入的 Release ZIP
- 当前插件的实际源码依赖、适配清单、图片/样式资源、锁定的 npm 依赖和独立构建脚本
- `.codlet-distribution.json`：开发提交、包摘要和文件清单，用于溯源和检查手工修改
- `codlet-plugin`、`codlet-official` 及对应功能 topics

生成仓库可以独立运行 `npm ci --prefix frontend`、`node frontend/build.mjs`。不要使用 GitHub 自动生成的 Source code ZIP 安装插件，它包含开发目录；使用明确上传的插件 ZIP。GUI 的 README 链接 UI Adapter 依赖，现有 Core 不自动下载安装依赖。

分发仓库的直接修改会中止同步，先把改动合回开发仓库。脚本不会 force push，不移动旧标签，不覆盖已有资产，也不会把私有仓库改成公开。同步期间远端分支发生变化时同样停止。

## 新增插件和独立版本

在 `plugins.json` 增加 ID、bundle 目录、入口、分发仓库、说明、topics 和依赖；同时添加普通 `codlet.json` 与插件源码。修改某插件后，只调整它的版本。版本由 manifest 提供，同步器拒绝用同一标签替换已发布或已有草稿的内容。共享源码导致多个插件发生变化时，这些插件都应调整版本。

`installerPlugins` 单独指定安装包携带的三个核心官方插件。新增普通官方插件默认只分发到自己的仓库，不自动扩大 MSI/便携包的预装集合；Core 构建器只读取这个预装子集。

## 当前私有预览与后续公开

默认 `-Apply` 只生成草稿。现阶段普通用户不能通过社区入口发现这些私有仓库，当前未认证的 GitHub 导入器也不能安装私有或草稿 Release。

将来确定公开发布时，先自行或明确授权调整仓库可见性；随后使用 `-Apply -AllowPublic -Publish`。脚本本身不改可见性。仓库仍为私有时 `-Apply -Publish` 只会发布私有 Release，不会让导入器获得访问凭据。

通过 GitHub 安装的插件，更新来源就是自己的分发仓库，现有 Core 的单插件 Release 检查可以直接使用。安装器继续从相同 `dist/catalog.json` 选择、校验并携带离线包，catalog 记录各插件的独立仓库和版本。

**预装的本地来源不会被伪装为 GitHub 安装。** 当前用户已有的预装插件继续保持来源、目录、权限和启停偏好。公开前还需验收“已有本地预装 → 经验证的 GitHub 安装”的迁移流程；本次仓库同步不修改正在运行的插件注册，也不声称已启用它们的 GitHub 自动更新。

## 检查

```powershell
node --test tests/distribution.test.mjs
powershell -NoProfile -File tests/distribution.ps1
```

另外对三个生成目录分别执行独立构建，比较 bundle 的 SHA-256；同步后核对私有状态、topics、标签、草稿状态及 GitHub 返回的资产 digest，再执行一次同步确认幂等。
