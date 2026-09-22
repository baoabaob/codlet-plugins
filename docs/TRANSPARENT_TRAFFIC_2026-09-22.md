# 官方后端透明流量 Adapter 原型

`host/codex-traffic.cjs` 是与 Core `codex/transparent-traffic` 配套的**私有启动辅助模块**。它尚未加入插件分发 manifest，不能据此宣称安装插件即自动接管桌面流量。当前公开 `registerThreadTransport` 和现有 GUI 行为保留。

## 已实现

- 核验 Windows 官方二进制 `0.155.0-alpha.9.2`，SHA-256 为 `bc45017e8239dc150258f69309ced9df6bbcdf5b8e4f346decf780ac0999e226`。未知哈希及未验证平台拒绝准备。
- 保留官方 `CODEX_CA_CERTIFICATE` / `SSL_CERT_FILE` 的优先级，交给 Core 合并一次启动专属 CA。原 provider、登录及模型配置不在这个辅助模块中重写。
- `respect_system_proxy=true` 在当前受控测试中未经过指定入口，准备函数拒绝该已知未验证策略，不关闭用户的配置。
- 基于核实过的 URL 分类模型 Responses 与 ChatGPT 模型列表；未知接口、thread/model 关联不猜测。
- `readCodexJsonBody` 有界读取并解码 identity/gzip/deflate/br/zstd；`rewrittenCodexJsonBody` 输出 JSON 并去除过期编码、长度、摘要头。Core 保持原始字节流契约，不认识 Codex JSON。

## 验证证据

Core 的受控驱动验证了实际官方二进制的 HTTP、HTTPS、SSE、WS、WSS，含保持内置 provider 的人工 API-key / ChatGPT 凭据夹具。真实测试进一步使用独立配置、当前有效官方 access token、一次性私有 CA 和原上游代理，验证了：

- 官方模型列表 200、真实 WSS 与 HTTPS/SSE 完成。
- HTTP 请求实际使用 zstd；重写后仍能完成真实对话。
- 磁盘历史恢复，以及同一个 app-server 中已加载任务的后续 turn。
- 原 WSS 连接需明确断开后重建；新请求经过处理器，真实响应改写标记到达 app-server。
- 已加载任务试验中 `modelProvider=openai` 保持；两次 turn 完成、退出码 0；结束后注册和活动交换均为 0。

原始凭据和正文不进入报告，独立登录快照、会话和私钥在结束后删除。测试不覆盖令牌刷新、用户日常自定义 provider、原桌面任务、附件或 macOS 真机。

完整边界及计数见 Core 分支的 `docs/TRANSPARENT_TRAFFIC_RESULTS_2026-09-22.md` 和 `docs/TRANSPARENT_TRAFFIC_EVIDENCE_2026-09-22.json`。本仓库新增及既有 Desktop / transport 回归为 38 项通过。

## 发布与能力门槛

`probeCodexTraffic()` 返回 `available:false`；即使哈希具备夹具证据，也不把它变成 `officialOAuth:true` 或 `existingLoadedThreads:true` 的可安装产品能力。当前 Native 启动管理器尚未持有并连接此入口，跨插件权限、代次和数据面 IPC 尚未接线。

待 Native 生命周期及权限接入、Electron 独立网络栈、完整上游代理 / 信任预检、公开 SDK 与 UI/skill、Windows Desktop 和 macOS 真机验收完成后，再发布直接注册接口并迁移现有 channel 使用方。当前分支已经吸收 `fea9796` 的 GUI 延迟视图改动，未改动原 checkout 的未提交 GUI 文件。
