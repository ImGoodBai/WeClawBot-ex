# Contributing to ClawBNB Hub

## Scope

This package ships one OpenClaw plugin entry with:

- the `clawbnb-weixin` channel
- the local Weixin control console
- the rental relay and proxy provider

## Working Rules

1. Treat upstream-derived runtime and protocol files as frozen unless a compatibility fix is explicitly required.
2. Keep new product logic in first-party files whenever possible.
3. Do not reintroduce `molthuman-oc-plugin` compatibility paths unless the mission explicitly requires them.
4. Keep public docs free of private workspace paths and private collaboration references.

## Safe Areas

1. `src/weixin/service/`
2. `README.md`, `README.zh_CN.md`, `CHANGELOG*`, `NOTICE`
3. package metadata and install docs
4. new adapter files with clear boundaries

## Minimum Verification

Run these before opening a change:

1. `npm run typecheck`
2. `npm run test:unit`
3. `npm run test:smoke`
4. `npm pack --dry-run --cache ./.npm-cache`
