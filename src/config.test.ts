import { describe, expect, it } from "vitest";
import { ensureMoltProxyRuntimeConfig, resolveMoltMarketConfig } from "./config.js";
import {
  DEFAULT_PROXY_MODEL_ID,
  MOLT_MARKET_PLUGIN_ID,
  MOLT_PROXY_PROVIDER_ID,
} from "./contracts.js";

describe("clawbnb-hub config", () => {
  it("applies stable defaults", () => {
    const resolved = resolveMoltMarketConfig({});
    expect(resolved.hostModelControl).toBe("inherit");
    expect(resolved.proxyBaseUrl).toBe("");
    expect(resolved.proxyModelId).toBe(DEFAULT_PROXY_MODEL_ID);
    expect(resolved.capabilityLevel).toBe("chat_only");
  });

  it("normalizes proxy baseUrl to the OpenAI-compatible /v1 root", () => {
    const resolved = resolveMoltMarketConfig({
      proxyBaseUrl: "http://127.0.0.1:9999/",
    });
    expect(resolved.proxyBaseUrl).toBe("http://127.0.0.1:9999/v1");
  });

  it("does not mutate host model config in inherit mode", () => {
    const pluginConfig = resolveMoltMarketConfig({
      proxyBaseUrl: "http://127.0.0.1:9999/v1",
      proxyModelId: "market-main",
    });
    const result = ensureMoltProxyRuntimeConfig(
      {
        plugins: {
          entries: {
            [MOLT_MARKET_PLUGIN_ID]: {
              enabled: true,
            },
          },
        },
      },
      pluginConfig,
    );

    expect(result.changed).toBe(false);
    expect(result.nextConfig.models?.providers?.[MOLT_PROXY_PROVIDER_ID]).toBeUndefined();
  });

  it("scrubs legacy plugin-injected proxy config in inherit mode", () => {
    const pluginConfig = resolveMoltMarketConfig({
      hostModelControl: "inherit",
    });
    const result = ensureMoltProxyRuntimeConfig(
      {
        models: {
          providers: {
            [MOLT_PROXY_PROVIDER_ID]: {
              api: "openai-completions",
              baseUrl: "http://127.0.0.1:9999/v1",
              apiKey: "runtime",
              models: [],
            },
          },
        },
        agents: {
          defaults: {
            models: {
              "molt-proxy/market-main": {
                alias: MOLT_MARKET_PLUGIN_ID,
              },
              "openai-codex/gpt-5.4": {
                alias: "codex",
              },
            },
          },
        },
        plugins: {
          entries: {
            [MOLT_MARKET_PLUGIN_ID]: {
              enabled: true,
              config: {
                proxyBaseUrl: "http://127.0.0.1:9999/v1",
                proxyModelId: "market-main",
              },
              subagent: {
                allowModelOverride: true,
                allowedModels: ["molt-proxy/market-main"],
              },
            },
          },
        },
      },
      pluginConfig,
    );

    expect(result.changed).toBe(true);
    expect(result.nextConfig.models?.providers?.[MOLT_PROXY_PROVIDER_ID]).toBeUndefined();
    expect(result.nextConfig.agents?.defaults?.models?.["molt-proxy/market-main"]).toBeUndefined();
    expect(result.nextConfig.agents?.defaults?.models?.["openai-codex/gpt-5.4"]).toMatchObject({
      alias: "codex",
    });
    expect(result.nextConfig.plugins?.entries?.[MOLT_MARKET_PLUGIN_ID]?.config).toBeUndefined();
    expect(result.nextConfig.plugins?.entries?.[MOLT_MARKET_PLUGIN_ID]?.subagent).toBeUndefined();
  });

  it("injects provider config and subagent override policy in proxy mode", () => {
    const pluginConfig = resolveMoltMarketConfig({
      hostModelControl: "proxy",
      proxyBaseUrl: "http://127.0.0.1:9999/v1",
      proxyModelId: "market-main",
    });
    const result = ensureMoltProxyRuntimeConfig(
      {
        plugins: {
          entries: {
            [MOLT_MARKET_PLUGIN_ID]: {
              enabled: true,
              config: {
                agentId: "legacy-agent-id",
              },
            },
          },
        },
      },
      pluginConfig,
    );

    expect(result.changed).toBe(true);
    expect(result.nextConfig.models?.providers?.[MOLT_PROXY_PROVIDER_ID]).toMatchObject({
      api: "openai-completions",
      baseUrl: "http://127.0.0.1:9999/v1",
    });
    expect(result.nextConfig.plugins?.entries?.[MOLT_MARKET_PLUGIN_ID]?.subagent).toMatchObject({
      allowModelOverride: true,
      allowedModels: ["molt-proxy/market-main"],
    });
    expect(result.nextConfig.agents?.defaults?.models?.["molt-proxy/market-main"]).toMatchObject({
      alias: "clawbnb-hub",
    });
    expect(result.nextConfig.plugins?.entries?.[MOLT_MARKET_PLUGIN_ID]?.config).not.toHaveProperty(
      "agentId",
    );
  });

  it("rejects proxy mode without an explicit proxyBaseUrl", () => {
    const pluginConfig = resolveMoltMarketConfig({
      hostModelControl: "proxy",
    });

    expect(() => ensureMoltProxyRuntimeConfig({}, pluginConfig)).toThrow(
      "hostModelControl=proxy requires plugins.entries.clawbnb-hub.config.proxyBaseUrl",
    );
  });
});
