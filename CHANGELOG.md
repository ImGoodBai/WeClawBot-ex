# Changelog

[简体中文](CHANGELOG.zh_CN.md)

This project follows the [Keep a Changelog](https://keepachangelog.com/) format.

## [2026.3.28]

### Changed

- renamed the public package, plugin id, and repository identity to `clawbnb-hub`
- renamed the Weixin channel id and state namespace to `clawbnb-weixin`
- rewrote install and migration docs for a clean break from `molthuman-oc-plugin`
- moved profile-linking helpers into an explicit optional-integration section

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
