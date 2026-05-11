# Changelog

[简体中文](CHANGELOG.zh_CN.md)

This project follows the [Keep a Changelog](https://keepachangelog.com/) format.

## Unreleased

### Changed

- added OpenClaw 2026.5.x compatibility for the Weixin channel by using the host-injected `ctx.channelRuntime`
- updated QR login compatibility with `@tencent-weixin/openclaw-weixin@2.4.3`: POST `get_bot_qrcode`, local token list support, and `binded_redirect` handling
- let fetch compute POST `Content-Length` for iLink requests to avoid Node 24 / undici request rejection
- added `channelConfigs` plugin metadata for newer OpenClaw hosts
- auto-add `role=plugin` to rental relay URLs when omitted

## [2026.3.28]

### Changed

- renamed the public package, plugin id, and repository identity to `clawbnb-hub`
- renamed the Weixin channel id and state namespace to `clawbnb-weixin`
- rewrote install and migration docs for a clean break from `molthuman-oc-plugin`
- moved profile-linking helpers into an explicit optional-integration section
- synced the embedded Weixin compatibility layer to the upstream `2.1.1` protocol behavior for QR redirect, iLink headers, and CDN full URLs

### Removed

- in-place compatibility promises for `molthuman-oc-plugin`

## [2026.3.24]

### Changed

- hardened runtime compatibility for OpenClaw `2026.3.14` by removing remaining root `plugin-sdk` runtime helper dependencies from the Weixin message pipeline
- switched account-id and channel-config helpers to explicit plugin-sdk subpaths and added local compatibility shims for typing, command-auth, and markdown stripping

## [2026.3.23]

### Added

- local automated quality gate: `test:unit`, `test:smoke`, `test:gate`
- mock QR flow smoke tests and config-triggered reload tests
- architecture and FAQ docs for official-plugin relationship and isolation boundary
- default one-WeChat-one-agent binding with `userId -> agentId` mapping and dedicated-agent registration
- dedicated binding unit and smoke coverage for `agents.list` + `bindings` writes
- automatic safe chat-isolation setup
