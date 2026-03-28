import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import type {
  OpenClawConfig,
  ProviderNormalizeResolvedModelContext,
  ProviderPrepareRuntimeAuthContext,
  ProviderRuntimeModel,
} from "openclaw/plugin-sdk/core";
import type { ProviderCatalogContext } from "openclaw/plugin-sdk/provider-catalog";
import type { ModelProviderConfig, ProviderPlugin } from "openclaw/plugin-sdk/provider-models";
import {
  MOLT_MARKET_ORDER_TAG_PREFIX,
  MOLT_PROXY_PLACEHOLDER_API_KEY,
  MOLT_PROXY_PROVIDER_ID,
} from "./contracts.js";
import {
  buildMoltProxyProviderConfig,
  resolveMoltMarketConfig,
  resolveMoltMarketConfigFromOpenClawConfig,
  type ResolvedMoltMarketConfig,
} from "./config.js";

const TRACE_ENABLED = process.env.MOLT_MARKET_TRACE === "1";
const PROVIDER_LOG_PREFIX = "[clawbnb-hub/provider]";

function trace(message: string, extra?: unknown): void {
  if (!TRACE_ENABLED) {
    return;
  }
  if (extra === undefined) {
    console.log(`${PROVIDER_LOG_PREFIX} ${message}`);
    return;
  }
  console.log(`${PROVIDER_LOG_PREFIX} ${message}`, extra);
}

function resolveProviderConfigFromOpenClawConfig(
  cfg: OpenClawConfig | undefined,
): ModelProviderConfig | undefined {
  return cfg?.models?.providers?.[MOLT_PROXY_PROVIDER_ID];
}

function resolveEffectivePluginConfig(
  cfg: OpenClawConfig | undefined,
  fallback: ResolvedMoltMarketConfig,
): ResolvedMoltMarketConfig {
  if (!cfg) {
    return fallback;
  }
  return resolveMoltMarketConfig({
    ...fallback,
    ...resolveMoltMarketConfigFromOpenClawConfig(cfg),
  });
}

export function normalizeMoltProxyModel(
  model: ProviderRuntimeModel,
  config: ResolvedMoltMarketConfig,
): ProviderRuntimeModel {
  return {
    ...model,
    api: "openai-completions",
    baseUrl: config.proxyBaseUrl,
  } as ProviderRuntimeModel;
}

function extractOrderIdFromText(text: string): string {
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith(MOLT_MARKET_ORDER_TAG_PREFIX)) {
      continue;
    }
    const orderId = line.slice(MOLT_MARKET_ORDER_TAG_PREFIX.length).trim();
    if (orderId) {
      return orderId;
    }
  }
  return "";
}

function collectTextFragments(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextFragments(entry));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  const fragments: string[] = [];
  if (typeof record.text === "string") {
    fragments.push(record.text);
  }
  if (typeof record.content === "string") {
    fragments.push(record.content);
  } else if (Array.isArray(record.content)) {
    fragments.push(...collectTextFragments(record.content));
  }
  return fragments;
}

function extractOrderIdFromPromptValue(value: unknown): string {
  for (const fragment of collectTextFragments(value)) {
    const orderId = extractOrderIdFromText(fragment);
    if (orderId) {
      return orderId;
    }
  }
  return "";
}

function extractOrderIdFromContext(context: unknown): string {
  if (!context || typeof context !== "object") {
    return "";
  }
  const systemPrompt = (context as { systemPrompt?: unknown }).systemPrompt;
  const promptOrderId = extractOrderIdFromPromptValue(systemPrompt);
  if (promptOrderId) {
    return promptOrderId;
  }
  const messages = (context as { messages?: unknown[] }).messages;
  if (!Array.isArray(messages)) {
    return "";
  }
  for (const message of messages) {
    for (const fragment of collectTextFragments(message)) {
      const orderId = extractOrderIdFromText(fragment);
      if (orderId) {
        return orderId;
      }
    }
  }
  return "";
}

function extractOrderIdFromPayload(payload: Record<string, unknown>): string {
  const topLevelOrderId = extractOrderIdFromPromptValue([
    payload.system,
    payload.instructions,
    payload.prompt,
    payload.input,
  ]);
  if (topLevelOrderId) {
    return topLevelOrderId;
  }

  const messages = payload.messages;
  if (!Array.isArray(messages)) {
    return "";
  }

  for (const message of messages) {
    for (const fragment of collectTextFragments(message)) {
      const orderId = extractOrderIdFromText(fragment);
      if (orderId) {
        return orderId;
      }
    }
  }

  return "";
}

function stripOrderTagFromText(text: string): string {
  return text
    .split(/\r?\n/u)
    .filter((line) => !line.trim().startsWith(MOLT_MARKET_ORDER_TAG_PREFIX))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n");
}

function stripOrderTagFromPayload(payload: Record<string, unknown>): void {
  if (typeof payload.system === "string") {
    payload.system = stripOrderTagFromText(payload.system);
  }
  if (typeof payload.instructions === "string") {
    payload.instructions = stripOrderTagFromText(payload.instructions);
  }
  if (typeof payload.prompt === "string") {
    payload.prompt = stripOrderTagFromText(payload.prompt);
  }
  const messages = payload.messages;
  if (!Array.isArray(messages)) {
    return;
  }
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const record = message as Record<string, unknown>;
    if (typeof record.content === "string") {
      record.content = stripOrderTagFromText(record.content);
      continue;
    }
    if (!Array.isArray(record.content)) {
      continue;
    }
    for (const part of record.content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string") {
        partRecord.text = stripOrderTagFromText(partRecord.text);
      }
    }
  }
}

function createMoltProxyWrapStreamFn(baseStreamFn: StreamFn | undefined): StreamFn {
  const underlying = (baseStreamFn ?? streamSimple) as StreamFn;
  return (model, context, options) => {
    const orderId = extractOrderIdFromContext(context);
    const originalOnPayload = options?.onPayload;
    trace("prepare request", {
      modelId: model.id,
      baseUrl: "baseUrl" in model ? model.baseUrl : undefined,
      orderId: orderId || null,
      hasSystemPrompt:
        Boolean((context as { systemPrompt?: unknown })?.systemPrompt),
    });
    return underlying(model, context, {
      ...options,
      headers: orderId
        ? {
            ...options?.headers,
            "X-Rental-Order-Id": orderId,
          }
        : options?.headers,
      onPayload: async (payload) => {
        if (payload && typeof payload === "object") {
          const record = payload as Record<string, unknown>;
          const payloadOrderId = orderId || extractOrderIdFromPayload(record);
          trace("patch payload", {
            modelId: model.id,
            orderId: payloadOrderId || null,
            messageCount: Array.isArray(record.messages) ? record.messages.length : 0,
            hasMetadata:
              Boolean(record.metadata && typeof record.metadata === "object"),
          });
          if (payloadOrderId) {
            const metadata =
              record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
                ? { ...(record.metadata as Record<string, unknown>) }
                : {};
            record.metadata = {
              ...metadata,
              orderId: payloadOrderId,
            };
          }
          stripOrderTagFromPayload(record);
        }
        return originalOnPayload?.(payload, model);
      },
    }) as ReturnType<StreamFn>;
  };
}

export function createMoltProxyProvider(
  initialConfig: ResolvedMoltMarketConfig,
): ProviderPlugin {
  return {
    id: MOLT_PROXY_PROVIDER_ID,
    label: "Molt Proxy",
    docsPath: "/providers/models",
    envVars: [],
    auth: [],
    catalog: {
      order: "simple",
      run: async (ctx: ProviderCatalogContext) => {
        const nextConfig = resolveEffectivePluginConfig(ctx.config, initialConfig);
        return {
          provider: buildMoltProxyProviderConfig(
            nextConfig,
            resolveProviderConfigFromOpenClawConfig(ctx.config),
          ),
        };
      },
    },
    normalizeResolvedModel: (ctx: ProviderNormalizeResolvedModelContext) => {
      if (ctx.provider !== MOLT_PROXY_PROVIDER_ID) {
        return undefined;
      }
      const nextConfig = resolveEffectivePluginConfig(ctx.config, initialConfig);
      return normalizeMoltProxyModel(ctx.model, nextConfig);
    },
    wrapStreamFn: ({ streamFn }) => createMoltProxyWrapStreamFn(streamFn),
    prepareRuntimeAuth: async (ctx: ProviderPrepareRuntimeAuthContext) => {
      const nextConfig = resolveEffectivePluginConfig(ctx.config, initialConfig);
      const apiKey =
        nextConfig.apiKey ||
        (ctx.apiKey && ctx.apiKey !== MOLT_PROXY_PLACEHOLDER_API_KEY ? ctx.apiKey : "");
      return {
        apiKey: apiKey || MOLT_PROXY_PLACEHOLDER_API_KEY,
        baseUrl: nextConfig.proxyBaseUrl,
      };
    },
  };
}
