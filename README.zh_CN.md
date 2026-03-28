# ClawBNB Hub

[English](./README.md)

仓库改名说明：这个公开仓此前的名字是 `WeClawBot-ex`。

`clawbnb-hub` 是一个独立的 OpenClaw 插件包，统一收拢了：

- `clawbnb-weixin` 微信 channel 运行时
- ClawBNB Hub 本地微信控制台
- ClawBNB 平台所需的 relay 和 proxy provider

## Breaking Change

这一版是从 `molthuman-oc-plugin` 做的干净切换，不提供原地兼容：

- 新包名：`clawbnb-hub`
- 新 plugin entry id：`clawbnb-hub`
- 新 channel id：`clawbnb-weixin`
- 新 state namespace：`<OPENCLAW_STATE_DIR>/clawbnb-weixin/`
- 不做旧配置自动迁移
- 不支持 `molthuman-oc-plugin` 和 `clawbnb-hub` 在同一个 profile 并装

## 安装

从 npm 安装：

```bash
openclaw plugins install clawbnb-hub
```

从本地工作区安装：

```bash
openclaw plugins install ./extensions/clawbnb-hub
```

## 迁移步骤

1. 先卸载或禁用 `molthuman-oc-plugin`
2. 删除旧配置：`plugins.entries.molthuman-oc-plugin` 与 `channels.openclaw-weixin`
3. 安装 `clawbnb-hub`
4. 按下面的配置示例写入新 key
5. 如需进入新 state namespace，请重新扫码接入微信

## 配置约定

插件级 relay / proxy 配置写在 `plugins.entries.clawbnb-hub.config`：

```json
{
  "plugins": {
    "entries": {
      "clawbnb-hub": {
        "enabled": true,
        "config": {
          "hostModelControl": "inherit",
          "apiKey": "YOUR_AGENT_API_KEY",
          "relayUrl": "ws://127.0.0.1:8787/ws/rental",
          "proxyBaseUrl": "http://127.0.0.1:8787/api/rental-proxy"
        }
      }
    }
  }
}
```

`hostModelControl` 模式：

- `inherit`（默认）：不改写宿主 OpenClaw 的模型 / provider 配置，直接沿用 Gateway 当前已有的本地模型能力
- `proxy`：显式接管宿主配置并切到 `molt-proxy` provider；必须显式提供 `proxyBaseUrl`

升级说明：

- 旧版本 `clawbnb-hub` 可能会把 `molt-proxy` 相关设置写进宿主 OpenClaw profile。
- 升级后只要用 `hostModelControl: "inherit"` 启动一次，插件会自动清掉这部分旧的插件接管痕迹。

微信 channel 配置写在 `channels.clawbnb-weixin`：

```json
{
  "channels": {
    "clawbnb-weixin": {
      "baseUrl": "https://ilinkai.weixin.qq.com",
      "cdnBaseUrl": "https://novac2c.cdn.weixin.qq.com/c2c",
      "demoService": {
        "enabled": true,
        "bind": "127.0.0.1",
        "port": 19120
      }
    }
  }
}
```

## 可选平台联动

插件本身可以独立运行；以下能力属于 optional integration：

- `MOLT_APP_BASE_URL`：用于控制台生成公开主页链接
- `INTERNAL_API_KEY`：用于调用平台侧绑定接口
- `/api/accounts/link-agent`：通过 claim token 把微信账号关联到公开主页

如果你不需要公开主页联动，可以完全不配置这些项。

## 仓库结构

- `src/weixin/`：内置微信运行时和本地控制台
- `src/`：relay 与 proxy provider
- `tests/unit`、`tests/smoke`：微信回归覆盖
- `docs/faq.md`：运维 FAQ
- `docs/architecture.md`：路由与隔离模型

## 质量门

发布前至少执行：

```bash
npm run typecheck
npm run test:unit
npm run test:smoke
npm pack --dry-run --cache ./.npm-cache
```

## 上游说明

当前以上游 `@tencent-weixin/openclaw-weixin@2.1.1` 为运行时基线。
上游派生层默认受控，一方新增能力优先放在控制台、包装层和文档层。

## 许可证

MIT。详见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
