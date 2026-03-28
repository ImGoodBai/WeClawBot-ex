import { describe, expect, it } from "vitest";
import { ensureMoltProxyRuntimeConfig, resolveMoltMarketConfig } from "./config.js";
import {
  DEFAULT_PROXY_BASE_URL,
  DEFAULT_PROXY_MODEL_ID,
  MOLT_MARKET_PLUGIN_ID,
  MOLT_PROXY_PROVIDER_ID,
} from "./contracts.js";

describe("clawbnb-hub config", () => {
  it("applies stable defaults", () => {
    const resolved = resolveMoltMarketConfig({});
    expect(resolved.proxyBaseUrl).toBe(DEFAULT_PROXY_BASE_URL);
    expect(resolved.proxyModelId).toBe(DEFAULT_PROXY_MODEL_ID);
    expect(resolved.capabilityLevel).toBe("chat_only");
  });

  it("normalizes proxy baseUrl to the OpenAI-compatible /v1 root", () => {
    const resolved = resolveMoltMarketConfig({
      proxyBaseUrl: "http://127.0.0.1:9999/",
    });
    expect(resolved.proxyBaseUrl).toBe("http://127.0.0.1:9999/v1");
  });

  it("injects provider config and subagent override policy", () => {
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
    expect(
      result.nextConfig.plugins?.entries?.[MOLT_MARKET_PLUGIN_ID]?.subagent,
    ).toMatchObject({
      allowModelOverride: true,
      allowedModels: ["molt-proxy/market-main"],
    });
    expect(result.nextConfig.agents?.defaults?.models?.["molt-proxy/market-main"]).toMatchObject({
      alias: "clawbnb-hub",
    });
    expect(
      result.nextConfig.plugins?.entries?.[MOLT_MARKET_PLUGIN_ID]?.config,
    ).not.toHaveProperty("agentId");
  });
});
