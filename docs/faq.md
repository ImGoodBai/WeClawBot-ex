# FAQ

## 1. 官方 `openclaw-weixin` 不是也支持多个微信吗？

是。上游已经有多账号运行骨架。  
`clawbnb-hub` 额外做的是控制台、二维码轮询、账号聚合、冷却诊断和默认的一微信一 agent 绑定。

## 2. 当前插件和 `molthuman-oc-plugin` 是什么关系？

`clawbnb-hub` 是一次干净切换，不是原地改名。

- 旧 plugin id：`molthuman-oc-plugin`
- 新 plugin id：`clawbnb-hub`
- 旧 channel id：`openclaw-weixin`
- 新 channel id：`clawbnb-weixin`

当前不支持这两个插件在同一个 OpenClaw profile 里并装。

## 3. 当前是不是“一微信对应一个 agent”？

默认就是。只有在缺少稳定 `userId`、达到上限或配置显式关闭时，才会回落到共享 `main`。

## 4. 当前的数据隔离到哪一层？

已经隔离的部分：

- 每个账号的 token / 登录凭据
- 每个账号的长轮询 monitor
- `context_token`
- 聊天上下文

还没有彻底隔离的部分：

- tool 使用环境
- runtime side effects
- 更强的租户边界

## 5. 扫码成功后为什么有时还需要手动重启？

插件会优先尝试自动触发 channel reload。  
如果宿主环境的配置文件不可写、watcher 不工作，或者自动刷新失败，页面会回退到手动重启提示。

## 6. `MOLT_APP_BASE_URL` 和 claim token 是必需的吗？

不是。它们只用于 optional integration，也就是把微信账号关联到平台公开主页。  
如果你只需要本地微信接入和消息收发，可以完全不配置这部分。

## 7. 当前最适合什么场景？

当前版本最适合：

- 本地或私有环境下多微信接入验证
- 一个 OpenClaw Gateway 面向多个微信入口
- 控制台演示和后续商业化分发前的产品验证
