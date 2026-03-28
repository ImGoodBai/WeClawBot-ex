# Architecture

## Current Model

`clawbnb-hub` embeds a Weixin control console and routes users in two modes:

```text
Default mode:
WeChat A <-> ClawBNB Hub Weixin Console <-> OpenClaw Agent A
WeChat B <-> ClawBNB Hub Weixin Console <-> OpenClaw Agent B
WeChat C <-> ClawBNB Hub Weixin Console <-> OpenClaw Agent C

Fallback mode:
WeChat X <-> ClawBNB Hub Weixin Console <-> main
```

This means:

- one OpenClaw Gateway process
- multiple WeChat accounts
- one dedicated OpenClaw agent per stable WeChat user by default
- shared `main` only as a fallback path
- chat context separated by default

## What This Plugin Adds

Compared with the upstream `@tencent-weixin/openclaw-weixin` runtime, `clawbnb-hub` mainly adds:

- a local web control console
- QR login polling and relogin flows
- aggregated account visibility
- cooldown diagnostics for `-14`
- auto-triggered channel reload after QR confirmation
- default `userId -> agentId` binding with dedicated-agent registration

## Isolation Boundary Today

Already isolated:

- per-account credentials
- per-account long-poll monitor state
- per-account/user `context_token`
- direct-message chat context
- dedicated agent routing for stable WeChat users

Not fully isolated yet:

- shared `main` is still the fallback when dedicated binding cannot be completed
- old `molthuman-oc-plugin` state is not migrated automatically
- tool execution and other runtime side effects are still shared

## Migration Boundary

This release does not attempt to share runtime ids with `molthuman-oc-plugin`.

- old plugin id: `molthuman-oc-plugin`
- new plugin id: `clawbnb-hub`
- old channel id: `openclaw-weixin`
- new channel id: `clawbnb-weixin`

That keeps the new package clean, but it means users may need to reinstall and re-scan.
