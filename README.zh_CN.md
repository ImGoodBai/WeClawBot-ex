# WeClawBot-ex

[English](./README.md)

**微信 ClawBot 多账号管理增强层** — 让微信 ClawBot 更适合多微信接入、统一管理和后续对外分发。

WeClawBot-ex 是基于官方 `@tencent-weixin/openclaw-weixin` 的产品化 fork。官方插件底层已经有多账号运行骨架；WeClawBot-ex 主要补上本地 Web 控制台、二维码登录管理、渠道诊断和更适合运营/分发的工作流。

## 相比官方 ClawBot 增加了什么

| | 官方 `openclaw-weixin` | WeClawBot-ex |
|---|---|---|
| 多账号运行 | 底层支持，主要通过 CLI | 支持，并提供统一 Web 控制台 |
| 扫码体验 | 终端输出 | 浏览器二维码 + 实时状态卡片 |
| 账号状态可观测 | 主要靠日志和本地状态 | 面板聚合展示 + 重扫入口 |
| 冷却诊断 | 需手动排查 | 内置 `-14` 冷却可见 |
| 会话隔离 | 需手动配置 `dmScope` | 明确推荐 `per-account-channel-peer` |

## 当前版本能力

当前公开版本已经支持：

- 多个微信账号接入同一个 OpenClaw Gateway
- 本地控制台统一管理二维码登录和渠道状态
- 通过 `dmScope=per-account-channel-peer` 做账号级 DM 会话隔离
- 扫码确认后自动触发 channel reload，失败时再手动重启兜底

当前版本**还没有**做到“一微信一 agent”。这属于下一阶段的大版本能力。

## 快速开始

### 前置条件

- Node.js >= 22
- 已安装 [OpenClaw](https://docs.openclaw.ai/install)（`openclaw` 命令可用）

### 安装

```bash
git clone https://github.com/ImGoodBai/WeClawBot-ex.git
cd WeClawBot-ex
openclaw plugins install .
```

### 命名说明

当前版本为了兼容运行时，仍然保留下面这几套标识：

- 产品名 / 仓库名：`WeClawBot-ex`
- 插件包名 + 插件配置键：`molthuman-oc-plugin-wx`
- 渠道配置键：`channels.openclaw-weixin`

所以日志里如果同时出现这几个名字，不代表装错仓库，这是当前版本的兼容口径。

### 配置

在 OpenClaw 配置中添加（`openclaw config edit`）：

```json
{
  "session": {
    "dmScope": "per-account-channel-peer"
  },
  "plugins": {
    "entries": {
      "molthuman-oc-plugin-wx": {
        "enabled": true,
        "package": "molthuman-oc-plugin-wx"
      }
    }
  },
  "channels": {
    "openclaw-weixin": {
      "baseUrl": "https://ilinkai.weixin.qq.com",
      "demoService": {
        "enabled": true,
        "port": 19120
      }
    }
  }
}
```

### 使用

1. 启动 OpenClaw Gateway
2. 打开 **http://127.0.0.1:19120/**
3. 点击 **添加微信渠道** — 用微信扫码并在手机上确认
4. 扫码成功后等待几秒，插件会尝试自动刷新微信通道
5. 如果新账号仍然没有上线，再执行 `openclaw gateway restart`
6. 用该微信发一条消息 — AI 智能体自动回复

每添加一个微信号，重复第 3 步即可。

## FAQ 与架构说明

- FAQ：[docs/faq.md](./docs/faq.md)
- 工作原理与隔离边界：[docs/architecture.md](./docs/architecture.md)

## 排障

- `WARNING: Plugin "... contains dangerous code patterns"` 当前在 OpenClaw 里只是告警，不会因为这条扫描提示直接拦截安装。
- 如果看到 `npm install failed`，必须拿到完整 npm stderr 才能确认根因。
- 先检查 `node -v`。当前插件要求 Node.js `>= 22`。
- 再检查 `openclaw --version`。过旧的 OpenClaw 版本可能和当前插件不兼容。
- 如果插件安装成功但管理端没起来，先确认 `channels.openclaw-weixin.demoService.enabled=true`，然后重启 Gateway。
- 如果扫码已经成功，但新账号还是收不到消息，先等自动刷新完成；还不行再使用诊断面板里的手动重启命令。

## 质量门

在提交或合并变更前，至少执行：

```bash
npm run test:unit
npm run test:smoke
npm run test:gate
npm run test:gate:full
```

当前自动化覆盖的重点是：

- 配置触发式 channel reload 与手动降级
- 账号聚合快照和会话隔离诊断
- 控制台页面渲染 smoke
- 本地 demo service 健康检查
- 不依赖真实微信设备的 mock 二维码流程

当前默认的关门命令是 `npm run test:gate`。
`npm run test:gate:full` 会额外执行 `typecheck`，等仓库把上游派生导入彻底独立化后，再把它提升为默认门禁。

## 工作原理

```
微信用户 A ──┐
微信用户 B ──┤──> WeClawBot-ex（多账号插件）
微信用户 C ──┘         |
                       |──> 共享 OpenClaw 智能体
                       |         |
                       └──< 回复各自的微信用户
```

- 基于官方 `@tencent-weixin/openclaw-weixin` 插件 (v1.0.2) 的 fork
- 扩展了 QR 登录模块，支持多会话并发管理
- 新增本地 Web 管理界面（`src/service/`）
- 在 `dmScope=per-account-channel-peer` 下，每个微信账号有独立 DM 会话
- 当前版本的 agent workspace、tools、副作用运行环境仍然共享

如果你重点关心“数据会不会串”，请直接看 [docs/architecture.md](./docs/architecture.md)。简化口径是：

- 当前：共享 agent，隔离聊天 session
- 下一阶段：一微信一 agent
- 后续：更彻底的 workspace / tools / runtime 隔离

## 维护边界

- 上游协议层和运行层视为冻结
- 后续只继续迭代我们自己的部分：`src/service/`、插件包装层、安装文档
- 除非遇到兼容性阻塞，否则不再修改上游派生文件

## 路线图

### 更强的隔离能力

- [ ] 一微信一 Agent
- [ ] 每个 Agent 独立 workspace
- [ ] Tool / runtime side-effect 隔离
- [ ] 租户边界硬化

### 商业化分发

- [ ] 可分享二维码（扫码即接入）
- [ ] 按微信入口计费
- [ ] 插件付费分发与商业化工作流

### 核心运行能力

- [ ] 群聊 @bot 模式
- [ ] 媒体消息支持（图片、文件、语音）
- [ ] 精确到单账号的热启动（不再依赖 channel 级 reload）

## 常见问题

### 官方插件不是也支持多个微信吗？

底层运行骨架是支持的。WeClawBot-ex 不是重新发明多账号，而是把官方已有的运行骨架做成了更适合扫码接入、管理、诊断和对外分发的产品化版本。

### 现在的数据隔离到哪一层？

当前主要解决的是聊天上下文串线问题，不是完整租户级硬隔离。也就是说，DM session 已隔离，但 agent workspace、tools 和运行副作用还没有完全隔离。

### 当前是不是一微信对应一个 agent？

还不是。当前多个微信仍然可以共享同一个 OpenClaw agent，只是会话分开。`一微信一 agent` 是下一阶段主任务。

## 许可证

MIT — 详见 [LICENSE](./LICENSE) 和 [NOTICE](./NOTICE) 中的上游声明。

## 微信交流群

扫码加入微信 ClawBot 交流群：

<img src="./docs/weclawbot-ex-wechat-group-qr.jpg" alt="WeClawBot-ex 微信交流群二维码" width="360" />
