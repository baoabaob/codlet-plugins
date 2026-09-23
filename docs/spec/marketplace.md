# GUI 插件市场：交互要求与集成边界

这是已验收交互设计及生产集成规范。生产入口 `frontend/src/codlet/app.jsx` 的 Add 菜单打开内部市场页，通过 Core 的 `githubDiscover` 发现 GitHub 仓库及 Release，并经现有 `githubPrepare`、`prepare`、`submit`、`operation` 流程审核和安装。`scripts/marketplace-preview/` 保留原始交互设计演示，其中条目和统计仍是模拟数据。生产 GUI 的本地预览使用 `scripts/serve-gui-preview.mjs` 中可注入的 Core RPC fixture，测试不会访问真实 GitHub 或变更用户注册。

## 入口与布局

- 在现有“添加”菜单第一项放置“插件市场”，下面保留创建、导入入口
- 市场作为 Codlet GUI 的内部页面，继续选中“插件管理”导航，不增加宿主侧栏入口
- 使用同一套 Core UI SDK、官方 Button/Input/Menu/Checkbox/Dialog/LoadingIndicator、Codlet 图标、标签 SVG 和列表样式
- 搜索支持仓库名称及 `#GitHub主题`，输入 `#` 提供候选；沿用现有标签合并逻辑。发布方声明的插件标签在列表/详情展示，不假定它已同步到仓库主题
- 来源筛选为全部 / 官方 / 社区；可勾选“仅看适用于此设备”
- 发布声明匹配时，列表显示发布方声明的插件名称、版本、标签、描述、适用系统、发布时间和累计包下载次数；未匹配时显示仓库与候选 Release 信息，缺失统计明确为未知。右侧复用详情、安装、更新、已安装状态。已准备的实际 ZIP 信息始终优先于发布声明
- 已加载结果默认按已匹配发布声明的插件发布时间倒序，可切换最多下载、名称排序。未知值排在已知值后；同值时按名称和 ID 稳定排序，不因重新渲染跳动。GitHub 搜索结果分页未取完时，界面提示排序范围仅覆盖已加载仓库
- 功能图标统一使用 24 单位网格、1.5 单位描边的细线 SVG；侧栏保留 PluginPuzzle 的轮廓，“添加”菜单图标仍为 18px，标签井号适当减轻线重
- 设置标题与说明区域的右侧提供带下划线的 GitHub 链接，随内容滚动；悬浮提示支持中英文（“点个星吧~⭐️” / “Leave a star~ ⭐️”）。链接打开 Codlet 主仓库，底部显示 `Powered by Codex & cccake`。预览复用生产设置组件，读写使用独立的内存演示状态
- 不增加评分或安全认证标记。生产市场只展示 Core 已核对声明的日期与下载量，缺失或不完整时显示未知

## 来源与统计口径

原型不再消费任意 `official: true` 字段。`compatibility/official-sources.json` 登记维护者控制的仓库，匹配 GitHub repository ID、owner ID、完整仓库名和插件 ID 绑定才显示“官方”。仓库被转移、同名重建、冒用作者名或添加 topic 均不能自动成为官方插件。本地文件没有这些来源证据时，不凭插件 ID 判定官方。

正式市场的来源字段由 Core 查询 GitHub。发现列表只把精确匹配的仓库标为“官方仓库”，不声称未下载的 ZIP 是官方插件。下载并校验后，GUI 再用 Core 预览里的插件 ID、repository ID、owner ID 和仓库名绑定显示“官方”。该标记是展示规则；Core 仍复核安装包来源、摘要、权限与明确授权。

已匹配的 `codlet-release.json` 是发布方与 ZIP 分开上传的声明。Core 将声明指定的资产名、大小和 SHA-256 与 GitHub Release 资产元数据核对后，才用其插件身份、标签和系统声明做发现展示；它不代替实际 ZIP 校验、安装授权或真机验收。发布时间取该 Release 的 `published_at`，不取仓库最后提交时间。下载量只累加各已列 Release 中声明指定且与 GitHub 元数据匹配的插件 ZIP 资产 `download_count`；分页未取完、声明缺失/不一致、统计缺失时显示未知，不能按 0 或所有 ZIP 的总数展示。该数字是包下载次数，不是独立用户或安装次数。

参考：[GitHub Release asset API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)。

## 系统兼容信息

通用包元数据与安装检查由 [Core 契约](https://github.com/baoabaob/codlet/blob/main/docs/README.md) 定义。元数据可声明 `platforms`、`runtimeApi`、`adapters`；没有声明时展示未知，不等于支持所有系统。GUI 不能绕过 Core 对系统/架构和 Runtime API 的检查。

生产展示须区分：

1. 本地导入、预装与 GitHub 来源显示同一套发布元数据；市场发现展示作者声明，包准备后展示实际 ZIP 内的元数据。
2. 官方包声明 Windows x64、Windows ARM64、macOS ARM64；支持声明与真实验收记录需要分开，不能将用户界面的支持声明当成测试报告。

按已确认的产品展示，预览中的官方插件列出 Windows x64、Windows ARM64、macOS Apple Silicon，不再显示“其他平台 / 待验收”。社区示例的系统信息同样是声明/模拟数据；此界面调整没有改写实际设备的历史验收记录，也不包含 Linux 适配。

仅使用跨平台 Core/Adapter 公共 API 的插件可以继承支持范围，但依赖一个 Adapter 本身不足以证明这一点。原型的 `supportedPlatforms` 先要求公共 API 边界审查结果，再按实际绑定的 provider、所需 capability API 版本、传递依赖和 Core 平台集合取交集；provider 缺失/冲突、循环、能力信息缺失或发现越界都保持未知。这里的审查记录与能力元数据仍是原型约定，未加入当前 Core 的发布契约，不能让插件作者自填一个字段就获得自动兼容标记。

`node scripts/audit-portability.mjs PLUGIN_DIRECTORY` 提供只读开发检查，报告原生文件、系统模块、平台路径、动态代码和直接私有接口等线索；限制扫描文件数和大小，不执行插件。它只产生候选/待审查/需显式声明结果，始终返回 `verified: false`。静态检查不能证明任意 JavaScript 的可移植性，也不代替真实设备测试；正式接入需把审核结论绑定到包摘要与实际能力解析结果。

## 详情与安装路径

统一在市场详情、安装审核和已安装插件详情里显示“系统与兼容性”：作者声明的支持系统/架构、当前设备、客户端适配版本、Codlet API。缺失字段明确标未知；Core 返回不兼容时无法确认安装，未知时审核页再次提示。“仅看适用于此设备”包含声明匹配且声明支持当前设备、或已准备 ZIP 后 Core 判定支持的条目；声明不等于真机测试。平台支持与客户端版本匹配是两个独立判断。

点击安装/更新进入现有模式的审核页：版本、来源、系统信息、依赖、权限、允许访问的来源和信任确认。确认后继续使用已批准的“安装须知”弹窗，保留“让 Codex 检查”、取消、知道了。

- 明确不兼容：详情可查看，安装不可用
- 未声明：显示未知提示，安装前再次展示，不自动当作兼容
- 已安装：保留管理入口，不重复安装
- 有更新：沿用蓝色 soft 更新按钮
- 请求失败：官方空状态与重试
- 正在加载：官方 LoadingIndicator

## 集成与边界

市场发现消费公开的 `codlet-plugin` 仓库/Release 搜索结果，支持分页和缓存，但安装候选必须再次经过 Core 的下载、摘要、manifest、系统、权限和依赖检查。索引信息不能直接作为安装授权。官方身份由明确的维护来源确定，不依赖任何人都能设置的 topic。

本地预装、普通本地导入、GitHub 安装共享元数据与设备检查；发布声明和实际包预览分别展示。操作系统最低版本目前没有专门字段，不能从系统名称推测。按包摘要保存的可移植性边界审查、provider/capability 平台契约和真实设备验收仍未接入，不能从作者声明推导出已验证的跨平台支持。

生产 GUI 已覆盖 Add 入口、发现/分页、统一详情、安装/更新审核与失败恢复；市场候选最终仍走 Core 准备和提交流程。实际 GitHub 包、原生 UI 与各操作系统结果仍以独立真机验收为准。

## 打开预览

```text
node scripts/prepare-core-sdk.mjs ABSOLUTE_CORE_CHECKOUT
node scripts/marketplace-preview/serve.mjs
```

服务只监听本机回环地址，仅提供界面文件与 Core UI SDK。启动输出 URL。页面底部可以切换浅/深色、模拟设备和加载/空列表/失败状态。生产 GUI 的构建入口不引用预览代码。
