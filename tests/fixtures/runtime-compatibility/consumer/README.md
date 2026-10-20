# Codlet 功能测试 1.0.0-rc.2

导入完整插件目录或发行 ZIP，启用后从侧栏打开“功能测试”。
需要 Core 的 Codex SDK API 1；工作区接口准备检查需要 Core rc.10。

## 检查方式

**只读检查**读取 Core 管理、资源、诊断、Native 来源和 Desktop 状态，
并准备工作区导航、正文、输入框、快捷键、动作和独立视口接口。
它不导航、不读取草稿、不挂载正文或输入框，也不提交模型请求。
报告会写入本插件目录。

**运行交互测试**还会打开未发送草稿，检查页面工具栏和输入框按钮，
使用临时存储、文件、凭据、回环 HTTP/WebSocket 服务及一个回显子进程。
相应 broker 授权需要允许这些资源；回显进程需要显式选择 Host 的
`process.execPath`。缺少授权会显示具体错误。

普通安装不自动运行。模型检查要求独立验收目录的 `owner.txt` 精确等于
`codlet-desktop-acceptance\n`，且 `fixture.json` 设置 `autorun:true` 和
HTTP `127.0.0.1` 服务。模型检查不能用于真实会话。

## 报告

覆盖清单来自 Core 的公开服务、Desktop、管理和 Workspace 类型契约，
以及草稿、附件、输入法、权限、分屏生命周期等明确场景。每项分别记录
`source`、`simulated`、`interface`、`read`、`operation` 五层证据。
没有执行的能力保留为 `not-verified`；界面显示操作验证、读取、接口、
不可用和未验证的数量。管理读取成功不会替 Native 流量来源通过验收。

当前插件自身只生成运行中的接口、读取和操作证据；源码分析与模拟测试
使用独立报告。接口匹配不能证明分屏完整生命周期、附件或物理输入法可用。
Native 流量源的挂接状态与真实模型流量改写也分别记录。

完整报告保存为 `functional-report.json`，Host 明细保存为
`host-report.json`。报告包含 Core 版本、可读取的 Core 二进制 SHA-256、
插件文件 SHA-256、Native 构建身份和当前文档暴露的相关脚本 SHA-256。
缺失身份明确标注。旧报告恢复后保留原来的身份并标为历史记录；
重新运行才产生当前证据。

`saveState`/`restoreState` 只转移结束后的观察记录。正在运行的检查拒绝
状态转移，重载不重放服务、进程、模型请求或用户操作。

## 开发

源码在开发仓库 `tests/fixtures/runtime-compatibility`。用 Core 仓库的
`scripts/generate-compatibility-coverage.mjs <consumer/coverage-catalog.json>`
刷新清单；生成器将公开类型文件的 SHA-256 一并写入。
模拟回归见 `tests/functional_fixture.test.mjs` 与
`tests/functional_coverage.test.mjs`。运行结果按具体构建记录，跨平台、
真实登录刷新、外部模型提供方和安装器升级均有独立待验证项。

测试夹具使用 `host.raw` Node Host、主世界及 Native DOM 访问，需审核这些
权限。Core 的 broker 授权不能把原始 Node Host 变成恶意代码沙箱。
