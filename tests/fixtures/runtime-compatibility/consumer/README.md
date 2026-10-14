# Codlet 功能测试 1.0.0-rc.1

在原来的 `compatibility.acceptance` 0.0.1 上扩展；沿用界面、工具栏、输入框按钮和未发送草稿的检查。

## 使用

需要 Core v1 的 Codex SDK API 1；Core 内置语义能力，不再另装 Desktop/UI Adapter。本地插件直接使用包含 `codlet.json`、`host.cjs` 和 `renderer.js` 的完整文件夹，通过 Codlet 的本地目录导入注册并启用，无需编译或 ZIP。左侧“功能测试”打开报告页，点击“运行功能测试”；可重复运行和导出 JSON 报告。

v1 候选保留完整功能检查，调用改为语义 SDK，并增加显式状态生命周期。错误和不确定回执不重试。统计分别显示通过、失败和未执行，模型检查的 `manual` 不进入已执行总数。每次运行结束，完整报告保存到插件目录的 `functional-report.json`，后台明细另存为 `host-report.json`；Host 激活时也会写自己的空闲报告。

文件、网络等标准服务测试需要相应类别授权，可用 `brokerPolicy.clientPermissions: true`。回显子进程另需精确 `executables` 选择：必须选该 Host 实际 `process.execPath`，广泛客户端授权不会自动选择程序；cwd/env 范围也不继承。采用精细授权时，文件目录与回环来源可显式列出。缺少授权的检查显示具体错误，不能把启动成功当作通过。

此测试夹具有自己的原始 Node HTTP/WebSocket 服务，所以明确使用 `host.mode:"node"` 与 `host.raw`；它也声明直接 Native DOM 断言和主世界访问。Core 强制执行 raw Host/main-world 准入与选定进程 broker 检查。`ui.nativeDom` 是作者声明/审核，isolated world 仍共享 DOM；full Node 可以直接绕过文件/网络 broker。这些例外不能借 Core 自己的权限自动授权，也不是恶意代码沙箱。

运行会打开一条未发送的测试草稿，临时启动回环 HTTP/WebSocket 服务和一个回显子进程，写入并删除插件自己的测试文件、存储项及临时合成凭据。普通安装不自动运行，也不提交模型消息。模型测试仅由独立验收驱动在标记过的测试目录和 `127.0.0.1` 服务中启用。

只读挂载时将 `fixture.json.autorun` 设为 false，或不提供此文件；不要点击运行，不调用 `Symbol.for('codlet.functional.acceptance')` 的 `run`/`prepareFixture`，也不提供测试 thread。当前没有禁用所有本地写入的总开关，Host 激活仍写自己的 `host-report.json`。模型检查同时要求受控根 `owner.txt` 精确等于 `codlet-desktop-acceptance\n`、`autorun:true` 和 HTTP `127.0.0.1` 地址。

`saveState`/`restoreState` 只保留已经结束的检查与计数；正在运行的测试拒绝快照。重载不会序列化闭包、DOM、活跃服务、请求或模型动作，也不自动重放它们。恢复阶段 `context.restoringState` 会阻止 autorun。正常旧插件没有 hooks 时仍可普通重载，但不能因此声称支持整套 Core 在线状态迁移。

## 覆盖范围

| 范围 | 实际检查 |
| --- | --- |
| Renderer / Host | 跨端 RPC、存储、跨端事件和生命周期释放 |
| 原生界面 | 侧栏页面、工具栏、UI 控件、输入框按钮点击与移除、未发送草稿 |
| Desktop 读取 | 兼容状态、任务、模型、技能、提供方和审批请求查询 |
| Core 服务 | 存储事务与冲突、事件重放、任务进度/幂等/取消、原子文件读写/版本冲突/监听、进程流与输入回执 |
| 网络和凭据 | 回环 fetch、直连配置、系统凭据元数据及限定来源的派发、删除 |
| 流量 | 显式通道的 HTTP/SSE/WebSocket、插件自己的 HTTP/WebSocket 请求/响应改写、原生来源状态 |
| 独立模型验收 | 新任务打开、配置读取、模型回合、消息事件和历史、提交前改写、原生模型请求/响应改写、追加输入、中断 |
| 管理和清理 | 只读管理快照、资源/诊断、外部驱动验证重载/禁用/启用与清理 |

报告中的 `manual` 表示当前环境没有执行该项，不计为通过。真实登录刷新、外部提供方、系统对话框、剪贴板、通知、全局快捷键及安装器升级不在自动检查中。插件不会自动批准任何审批请求。

源码与独立验收说明见开发仓库 `tests/fixtures/runtime-compatibility`。历史 0.0.3 的 Windows Native 记录不替代本次 v1 验收；当前自动化测试也不证明其它平台、真实登录或真实模型会话已通过。包中的作者平台声明、SDK 契约与实际验收记录应分别核对。
