# 变更日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 格式。

## [2026.3.28]

### 变更

- 将公开包名、plugin id 和仓库品牌统一切到 `clawbnb-hub`
- 将微信 channel id 和 state namespace 统一切到 `clawbnb-weixin`
- 安装与迁移文档改写为从 `molthuman-oc-plugin` 的干净切换方案
- 将 claim token / 平台主页联动明确收口到 optional integration

### 移除

- 不再承诺 `molthuman-oc-plugin` 的原地兼容升级

## [2026.3.24]

### 变更

- 针对 OpenClaw `2026.3.14` 进一步补强运行时兼容，移除了微信消息链路里残留的 root `plugin-sdk` 运行时 helper 依赖
- 将 account-id 和 channel-config helper 切到明确子路径，并新增本地 typing、command-auth、markdown strip 兼容层

## [2026.3.23]

### 新增

- 本地自动化质量门：`test:unit`、`test:smoke`、`test:gate`
- mock 二维码流程 smoke 测试和配置触发式 reload 测试
- 用于解释官方插件关系和隔离边界的架构文档与 FAQ
- 默认的一微信一 agent 绑定能力：`userId -> agentId` 映射与独立 agent 注册
- 针对 `agents.list` + `bindings` 写入的 dedicated binding 单测与 smoke 测试
- 首次绑定时自动完成安全的聊天隔离设置
