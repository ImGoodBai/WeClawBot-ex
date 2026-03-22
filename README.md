# WeClawBot-ex

[简体中文](./README.zh-CN.md)

Standalone Weixin gateway that reuses the readable Weixin protocol layer and connects direct messages to **Claude Code**.

Scan Weixin QR -> Chat on Weixin -> Get Claude Code replies.

Current status:

1. Claude Code backend is implemented and verified locally.
2. Echo adapter is available for protocol-only testing.
3. Codex is not implemented yet.

This project does not depend on the OpenClaw runtime.

## Features

- Weixin QR login with local account persistence
- Direct text message receive/reply loop via Weixin
- Claude Code as the AI backend (multi-turn session support)
- Per-user persistent Claude sessions across restarts
- Echo adapter for protocol-only testing
- Pure Node.js, no native dependencies

## Quick Start

### Prerequisites

- Node.js >= 22
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

### Install And Run

```bash
git clone git@github.com:ImGoodBai/WeClawBot-ex.git
cd WeClawBot-ex
npm install

# Step 1: Login and scan the printed QR link in Weixin
npm run login

# Step 2: Start the gateway
npm run start -- --cwd /absolute/path/to/your/project
```

Then send a direct text message in Weixin. Claude Code will reply in the same conversation.

### Test without Claude (echo mode)

```bash
npm run start -- --adapter echo
```

## CLI Reference

```
Commands:
  login       Generate a Weixin QR and link one account
  start       Start the gateway (forwards messages to Claude Code)
  accounts    List saved Weixin accounts

Options:
  --adapter <claude|echo>     AI backend (default: claude)
  --cwd <dir>                 Working directory for Claude Code
  --login                     Login before starting
  --account-id <id>           Use a specific saved account
  --claude-model <model>      Claude model override
  --claude-timeout-ms <ms>    Response timeout (default: 300000)
```

## How It Works

```
Weixin User
    |
    v
[Reusable Weixin Protocol Layer]
    |
    v
WeClawBot-ex gateway (this project)
    |
    v
Claude Code CLI (local)
    |
    v
Reply back to Weixin
```

1. Reuses the Weixin QR login and message protocol from readable source code
2. Runs as a standalone Node.js process with no OpenClaw runtime dependency
3. Routes inbound Weixin messages to Claude Code via CLI
4. Returns Claude's response to the same WeChat conversation

## Roadmap

- [ ] Codex backend adapter
- [ ] Group chat (@bot mode)
- [ ] Media message support
- [ ] Publish or package a reusable install flow
- [ ] Multi-account orchestration

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WXCLAWBOT_STATE_DIR` | State directory (default: `~/.weclawbot-ex`, legacy state auto-reused) |
| `WXCLAWBOT_WEIXIN_BASE_URL` | Weixin API base URL |
| `WXCLAWBOT_ROUTE_TAG` | Route tag override |
| `WXCLAWBOT_WORKDIR` | Working directory for Claude Code |
| `WXCLAWBOT_CLAUDE_BIN` | Claude CLI binary (default: `claude`) |
| `WXCLAWBOT_CLAUDE_MODEL` | Claude model |
| `WXCLAWBOT_CLAUDE_PERMISSION_MODE` | Permission mode |

## Weixin Group

If you want to join the Weixin group for this project, scan:

<img src="./docs/wechat-group-qr.jpg" alt="Weixin group QR" width="280" />

## License

MIT
