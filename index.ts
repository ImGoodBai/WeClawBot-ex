import { definePluginEntry, type OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  isMoltMarketSessionKey,
  MOLT_MARKET_PLUGIN_ID,
  MOLT_PROXY_PROVIDER_ID,
} from "./src/contracts.js";
import { resolveMoltMarketConfig } from "./src/config.js";
import { createMoltProxyProvider } from "./src/provider.js";
import { createMoltMarketService } from "./src/service.js";
import { weixinPlugin } from "./src/weixin/channel.js";
import { assertHostCompatibility } from "./src/weixin/compat.js";
import { registerWeixinCli } from "./src/weixin/log-upload.js";
import { setWeixinRuntime } from "./src/weixin/runtime.js";
import { createWeixinDemoService } from "./src/weixin/service/index.js";

function createBeforeModelResolveHandler(config: ReturnType<typeof resolveMoltMarketConfig>) {
  return (_event: { prompt: string }, ctx: { sessionKey?: string }) => {
    if (!isMoltMarketSessionKey(ctx.sessionKey)) {
      return;
    }
    return {
      providerOverride: MOLT_PROXY_PROVIDER_ID,
      modelOverride: config.proxyModelId,
    };
  };
}

function createBeforeToolCallHandler(config: ReturnType<typeof resolveMoltMarketConfig>) {
  return (
    _event: { toolName: string; params: Record<string, unknown> },
    ctx: { sessionKey?: string },
  ) => {
    if (!isMoltMarketSessionKey(ctx.sessionKey)) {
      return;
    }
    return {
      block: true,
      blockReason: config.toolRefusalText,
    };
  };
}

function createBeforePromptBuildHandler(config: ReturnType<typeof resolveMoltMarketConfig>) {
  return (
    _event: { prompt: string; messages: unknown[] },
    ctx: { sessionKey?: string },
  ) => {
    if (!isMoltMarketSessionKey(ctx.sessionKey)) {
      return;
    }
    return {
      appendSystemContext: [
        "You are serving a ClawBNB Hub rental session.",
        "Tool access is disabled for this session.",
        "Reply to the buyer with plain text only.",
      ].join("\n"),
    };
  };
}

export default definePluginEntry({
  id: MOLT_MARKET_PLUGIN_ID,
  name: "ClawBNB Hub",
  description: "ClawBNB Hub Weixin channel, rental relay, proxy provider, and session guardrails",
  register(api: OpenClawPluginApi) {
    if (!api?.runtime) {
      throw new Error("[clawbnb-hub] api.runtime is not available in register()");
    }

    assertHostCompatibility(api.runtime.version);
    setWeixinRuntime(api.runtime);
    api.registerChannel({ plugin: weixinPlugin });

    const mode = (api as OpenClawPluginApi & { registrationMode?: string }).registrationMode;
    if (mode && mode !== "full") {
      return;
    }

    api.registerCli(({ program, config }) => registerWeixinCli({ program, config }), {
      commands: ["clawbnb-weixin"],
    });
    api.registerService(createWeixinDemoService(api));

    const pluginConfig = resolveMoltMarketConfig(api.pluginConfig);
    api.registerProvider(createMoltProxyProvider(pluginConfig));
    api.on("before_model_resolve", createBeforeModelResolveHandler(pluginConfig));
    api.on("before_prompt_build", createBeforePromptBuildHandler(pluginConfig));
    api.on("before_tool_call", createBeforeToolCallHandler(pluginConfig));
    api.registerService(
      createMoltMarketService({
        api,
        pluginConfig,
      }),
    );
  },
});
