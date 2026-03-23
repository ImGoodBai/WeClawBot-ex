# Architecture

## Current Model

Current public releases of WeClawBot-ex follow this structure:

```text
WeChat User A ──┐
WeChat User B ──┤──> WeClawBot-ex
WeChat User C ──┘         |
                          |──> OpenClaw Gateway
                          |         |
                          └──> Shared OpenClaw Agent
```

This means:

- one OpenClaw Gateway process
- multiple WeChat channel accounts
- one shared OpenClaw agent by default
- DM session isolation through `dmScope=per-account-channel-peer`

## What WeClawBot-ex Adds

Compared with the upstream `@tencent-weixin/openclaw-weixin` plugin, WeClawBot-ex mainly adds:

- a local Web control console
- QR login state polling
- account aggregation and relogin UX
- cooldown visibility for `-14`
- auto-triggered channel reload after QR confirmation
- a minimal automated quality gate

The upstream plugin already contains much of the multi-account runtime skeleton.  
WeClawBot-ex focuses on management, operator workflow, and productization.

## Isolation Boundary Today

### Already isolated

- account credentials are stored per account
- each account runs its own long-poll monitor
- `context_token` is tracked per account / user pair
- DM session keys can be isolated by `accountId + peer`

### Not fully isolated yet

- multiple WeChat accounts can still share one OpenClaw agent
- agent workspace is shared
- tool execution environment is shared
- runtime side effects are shared

So the current release solves **conversation cross-talk**, but not full tenant-level hard isolation.

## Planned Next Stage

The next major architecture step is:

```text
WeChat User A -> Weixin Account A -> Agent A
WeChat User B -> Weixin Account B -> Agent B
WeChat User C -> Weixin Account C -> Agent C
```

This future model aims to add:

- one WeChat account -> one OpenClaw agent
- independent workspace per agent
- stronger tenant boundaries
- less risk of shared tool/runtime side effects

## Commercial Direction

WeClawBot-ex is also designed toward future commercial distribution:

- shareable QR entry points
- charging per WeChat entry
- distribution-friendly plugin workflow

That commercial path depends on two foundations:

1. stronger isolation
2. cleaner distribution and billing flows

