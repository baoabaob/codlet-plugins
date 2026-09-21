# 官方插件性能检查 · 2026-09-21

UI Adapter 现在仅在原生侧栏或插件生命周期发生变化时重新定位，不再为聊天正文的每次文本更新扫描全页。原生导航、页面嵌套挂载、工具栏替换与卸载行为有回归覆盖。

同一 Node v24.18.1/jsdom 工作负载（1,000 个历史元素、1,000 次消息文本变化、5 轮中位数）中，扫描次数由 1,000 降至 0，整段耗时从 151.79 ms 降至 25.38 ms（减少 83.3%）。这不是整台客户端加速比例。

Desktop Adapter 做了 50,000 条消息与 100 轮启停测试；GUI 做了 200 轮加载和页面打开/关闭/卸载。未复现随代数累积大量旧插件对象的情况。完整口径、数字、堆快照限制和 Defender 阻断原生 Core 测量的记录见 [Core 性能报告](https://github.com/baoabaob/codlet/blob/main/docs/PERFORMANCE_2026-09-21.md)。

复测：先用 `node scripts/prepare-core-sdk.mjs <Core 绝对路径>` 准备匹配 SDK，再用 `node --expose-gc scripts/profile-runtime.mjs <navigation|ui|desktop|gui> <输出.json>`。设置 `CODLET_PROFILE_CYCLES=200` 可运行 200 轮 GUI 压测；使用同一 Node 版本比较前后耗时。
