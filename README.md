# ClawBNB Hub

`clawbnb-hub` is a standalone OpenClaw plugin that bundles:

- the `clawbnb-weixin` channel runtime
- the ClawBNB Hub local Weixin control console
- the rental relay and proxy provider used by the ClawBNB platform stack

## Breaking Release

This release is a clean cut from `molthuman-oc-plugin`.

- New package name: `clawbnb-hub`
- New plugin entry id: `clawbnb-hub`
- New channel id: `clawbnb-weixin`
- New state namespace: `<OPENCLAW_STATE_DIR>/clawbnb-weixin/`
- No automatic migration from `molthuman-oc-plugin`
- Do not run `molthuman-oc-plugin` and `clawbnb-hub` in the same OpenClaw profile

## Install

From npm:

```bash
openclaw plugins install clawbnb-hub
```

From a local checkout:

```bash
openclaw plugins install ./extensions/clawbnb-hub
```

## Migration

1. Disable or uninstall `molthuman-oc-plugin`.
2. Remove old config under `plugins.entries.molthuman-oc-plugin` and `channels.openclaw-weixin`.
3. Install `clawbnb-hub`.
4. Add the new config keys shown below.
5. Re-scan Weixin accounts if you want them in the new `clawbnb-weixin` state namespace.

## Config Contract

Plugin-level relay and proxy settings stay under `plugins.entries.clawbnb-hub.config`:

```json
{
  "plugins": {
    "entries": {
      "clawbnb-hub": {
        "enabled": true,
        "config": {
          "apiKey": "YOUR_AGENT_API_KEY",
          "relayUrl": "ws://127.0.0.1:8787/ws/rental",
          "proxyBaseUrl": "http://127.0.0.1:8787/api/rental-proxy"
        }
      }
    }
  }
}
```

Weixin channel settings stay under `channels.clawbnb-weixin`:

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

## Optional Integration

The plugin works without platform-side profile linking.

Optional integration points:

- `MOLT_APP_BASE_URL`: used by the local console when generating public profile links
- `INTERNAL_API_KEY`: used when calling platform-side profile binding endpoints
- `/api/accounts/link-agent`: local console helper for linking a Weixin account to a public profile via claim token

If you do not need public profile linking, you can ignore these settings entirely.

## Repository Layout

- `src/weixin/`: embedded Weixin runtime and local control console
- `src/`: rental relay and proxy provider implementation
- `tests/unit` and `tests/smoke`: Weixin regression coverage
- `docs/faq.md`: operator FAQ
- `docs/architecture.md`: routing and isolation model

## Quality Gate

Run these before publishing:

```bash
npm run typecheck
npm run test:unit
npm run test:smoke
npm pack --dry-run --cache ./.npm-cache
```

## Upstream

This project continues to track `@tencent-weixin/openclaw-weixin` as the upstream runtime baseline.
Upstream-derived files remain intentionally constrained; first-party work should stay in the control console, packaging, and docs layers.

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
