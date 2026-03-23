# FAQ

## 1. 官方 `openclaw-weixin` 不是也支持多个微信吗？

是的，官方插件底层已经有多账号运行骨架，包括账号存储、账号枚举和按账号启动 monitor。  
WeClawBot-ex 的重点不是“重新发明多账号”，而是把这些底层能力做成更易用的产品：

- 本地 Web 控制台
- 浏览器二维码与状态轮询
- 账号聚合展示
- `-14` 冷却诊断
- 更清楚的安装、运维和分发路径

## 2. WeClawBot-ex 和官方插件是什么关系？

当前项目是基于 `@tencent-weixin/openclaw-weixin@1.0.2` 的 fork/vendor 形态维护。  
上游运行和协议层默认冻结，我们主要在自己的控制台、包装层和少量白名单 patch 文件上继续迭代。

## 3. 当前是不是“一微信对应一个 agent”？

还不是。当前公开版本的默认口径是：

- 多个微信账号可以接入同一个 OpenClaw Gateway
- 会话通过 `dmScope=per-account-channel-peer` 做隔离
- 但多个微信账号仍然可能共享同一个 OpenClaw agent

`一微信一 agent` 已经是明确的下一阶段方向，但当前版本还未实现。

## 4. 当前的数据隔离到哪一层？

当前版本主要做到的是聊天上下文隔离，而不是完整租户隔离。

已经隔离的部分：

- 每个账号的 token / 登录凭据
- 每个账号的长轮询 monitor
- `context_token`
- DM session key

还没有彻底隔离的部分：

- OpenClaw agent workspace
- tool 使用环境
- runtime side effects
- 更强的租户边界

一句话说：当前解决的是“聊天串线”，不是“所有资源都彻底隔离”。

## 5. 扫码成功后为什么有时还需要手动重启？

当前版本会优先尝试自动触发 channel reload。  
如果宿主环境的配置文件不可写、watcher 不工作，或者自动刷新失败，页面会回退到手动重启提示。

这也是为什么控制台里还保留了 Gateway restart 的兜底命令。

## 6. 为什么机器人不回复？

最常见的原因有这些：

- 扫码后还没等自动刷新完成
- 当前环境需要手动 `openclaw gateway restart`
- 该微信还没有先发第一句话，`context_token` 尚未建立
- 上游模型配置错误
- 微信 session 进入 `-14` 冷却

## 7. 当前项目最适合什么场景？

当前版本最适合：

- 本地或私有环境下多微信接入验证
- 一个 OpenClaw 机器人面向多个微信入口
- 控制台演示和后续商业化分发前的产品验证

如果你需要严格的租户级资源隔离，请等后续 `一微信一 agent` 和更彻底的 workspace/tool 隔离能力。

