# public surface 与确认输入器的一致性修正

消费端在完整 4239d0b 包中记录：fixture1 的 navigation committed 成功、修订 focus=true、正确非零尺寸 Native 输入器读回匹配，但 `getSurface().composer.element` 仍是旧 cached 输入器。原始证据为分屏仓库 `.checks/native-comparison/consumer-20caea10-7068-49e1-9816-177e82f11170/driver/report.json`：正确焦点读回 true，surfaceContainsFocused=false，surface 的 layout/text 两个布尔值 false。它证明接口之间的分歧，不代表草稿丢失或持久化状态。

本轮只读该报告及 Adapter 源码，未启动 Native/profile 或执行 Computer Use，未改消费者源码、草稿或真实数据。

## 源码复现

旧实现的两条可复现路径：

- navigation 确认后只 `publish(true)`，public surface/geometry 等 Workspace 下一次 reconcile。visible 文档使用 rAF，committed Promise 可以先于该帧完成，因此同一时刻公开 route 已变而 composer 仍旧。
- Workspace MutationObserver 将稳定 scroller 内没有角色移除的变动当作正文更新忽略；`data-app-shell-active-page` 属性切换也落入该条件，cached footer 激活后可能完全不触发角色刷新。

新增两项离线集成回归先在旧实现下失败，再在修正后通过：稳定 scroller 中只切换 footer active 属性；以及不释放 queued visible frame 就立即读取 committed 后的 public composer。它们复现源码缺口，尚不能证明消费端此次分歧只由其中某一条造成。

## 修正和开销边界

Native 的模型/controller/scope/提交归属和完整输入 pin 检查保留。只有原来已通过确认的 input 才作为私有 hint 传给 Workspace；Workspace 在 committed receipt 完成前同步更新 composer 所属 main/content/scroller/footer、迁移已有 surface lease，并发布 geometry。未扩大公开字段、能力、ready/receipt 或 focus 契约。

私有 hint 必须来自本 document 的 Native root、非 consumer-owned、非 inactive 且具有正确 composer/main/body/footer 归属；失效时 surface 明确 unavailable，不把旧 cached 输入器当作新输入器。后续结构扫描在严格 Native navigation 已准备时也使用同一实际 main input 检查，避免下一帧由弱 DOM 首选重新覆盖已确认的输入器。Native 对象只在 Adapter 内部传递，不返回给插件。

active-page 属性是结构信号，即使在稳定 scroller 中也必须刷新；普通正文 token 和 consumer-owned 变化仍被忽略。角色没有变化时继续复用 resize 订阅和 geometry。新增断言确认 committed 只增加一次 geometry 读取，排队的下一帧不重复；流式正文/feature-only 原回归仍通过。没有周期扫描、几何条件猜测或根据焦点挑选输入器。

bundle 重建，相关 **158/158 测试通过，0 失败、0 跳过**。日志 `.artifacts/workspace-surface-consistency-suite.log`。三项新回归覆盖上述两条时序及 owned/inactive/outside-root hint 拒绝。没有重新跑没有变化的 Native 多面板或性能矩阵。

## 最小 Native 后续实验

当前是源码和离线验证完成的候选，**尚未重新 Native 验证**。不自行启动共享 profile；下一次由单一启动者约定时机后，使用新的完整包快照与已核验独立 Target：

1. 只使用 ledger 的 fixture0/1；先打开0，随后1，再回0。保持 document visible 以覆盖 rAF 路径。
2. 每次 await committed、显式 revision focus；在同一续体立即比较 `getSurface().composer.element.contains(document.activeElement)`，再在一个 frame 后比较一次。记录 available、element 身份是否稳定、非零 layout、是否包含焦点及已知合成文本匹配的布尔值，不记录文本内容。
3. 退出并核验临时监听/slot/lease/自有 DOM 为0，移除临时包、正常关闭及用新身份算法退役。无 turn、草稿/附件写入或恢复操作，不增加 UI 拖拽/矩阵；如要 Computer Use，应继续遵守用户在分屏会话给出的模型/代理要求。

这是输入器选择与发布时机检查，不是 durable-save ACK、精确 paint 或前台 P95 测量。原消费者失败及只读观测保留；不因为 candidate 离线通过就宣布 Native 分歧已实测消失。
