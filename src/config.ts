import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-models";
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_PROXY_BASE_URL,
  DEFAULT_PROXY_MODEL_ID,
  DEFAULT_RECONNECT_BASE_DELAY_MS,
  DEFAULT_RECONNECT_MAX_DELAY_MS,
  DEFAULT_RUN_TIMEOUT_MS,
  DEFAULT_TEMP_ROOT,
  DEFAULT_TOOL_REFUSAL_TEXT,
  MOLT_MARKET_PLUGIN_ID,
  MOLT_PROXY_PLACEHOLDER_API_KEY,
  MOLT_PROXY_PROVIDER_ID,
} from "./contracts.js";

export type ResolvedMoltMarketConfig = {
  enabled: boolean;
  apiKey: string;
  relayUrl: string;
  proxyBaseUrl: string;
  proxyModelId: string;
  skillTags: string[];
  capabilityLevel: "chat_only";
  version: string;
  heartbeatIntervalMs: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  runTimeoutMs: number;
  tempRoot: string;
  toolRefusalText: string;
  extraSystemPrompt: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asTrimmedString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeProxyBaseUrl(value: unknown): string {
  const trimmed = asTrimmedString(value, DEFAULT_PROXY_BASE_URL).replace(/\/+$/u, "");
  if (!trimmed) {
    return DEFAULT_PROXY_BASE_URL;
  }
  return /\/v1$/iu.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export function resolveMoltMarketConfig(raw: unknown): ResolvedMoltMarketConfig {
  const record = asRecord(raw);
  return {
    enabled: record.enabled !== false,
    apiKey: asTrimmedString(record.apiKey),
    relayUrl: asTrimmedString(record.relayUrl),
    proxyBaseUrl: normalizeProxyBaseUrl(record.proxyBaseUrl),
    proxyModelId: asTrimmedString(record.proxyModelId, DEFAULT_PROXY_MODEL_ID),
    skillTags: asStringArray(record.skillTags),
    capabilityLevel: "chat_only",
    version: asTrimmedString(record.version, "2026.3.19"),
    heartbeatIntervalMs: asPositiveInt(record.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS),
    reconnectBaseDelayMs: asPositiveInt(
      record.reconnectBaseDelayMs,
      DEFAULT_RECONNECT_BASE_DELAY_MS,
    ),
    reconnectMaxDelayMs: Math.max(
      asPositiveInt(record.reconnectMaxDelayMs, DEFAULT_RECONNECT_MAX_DELAY_MS),
      asPositiveInt(record.reconnectBaseDelayMs, DEFAULT_RECONNECT_BASE_DELAY_MS),
    ),
    runTimeoutMs: asPositiveInt(record.runTimeoutMs, DEFAULT_RUN_TIMEOUT_MS),
    tempRoot: asTrimmedString(record.tempRoot, DEFAULT_TEMP_ROOT),
    toolRefusalText: asTrimmedString(record.toolRefusalText, DEFAULT_TOOL_REFUSAL_TEXT),
    extraSystemPrompt: asTrimmedString(record.extraSystemPrompt),
  };
}

export function resolveMoltMarketConfigFromOpenClawConfig(
  cfg: OpenClawConfig | undefined,
): ResolvedMoltMarketConfig {
  const entries = asRecord(cfg?.plugins?.entries);
  const pluginEntry = asRecord(entries[MOLT_MARKET_PLUGIN_ID]);
  return resolveMoltMarketConfig(pluginEntry.config);
}

export function buildMoltProxyProviderConfig(
  config: ResolvedMoltMarketConfig,
  current?: ModelProviderConfig,
): ModelProviderConfig {
  const existingModels = Array.isArray(current?.models) ? current.models : [];
  const hasPrimaryModel = existingModels.some((entry) => entry?.id === config.proxyModelId);
  return {
    ...current,
    api: "openai-completions",
    baseUrl: config.proxyBaseUrl,
    apiKey:
      typeof current?.apiKey === "string" && current.apiKey.trim()
        ? current.apiKey
        : MOLT_PROXY_PLACEHOLDER_API_KEY,
    models: hasPrimaryModel
      ? existingModels
      : [
          ...existingModels,
          {
            id: config.proxyModelId,
            name: config.proxyModelId,
            api: "openai-completions",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          },
        ],
  };
}

export function ensureMoltProxyRuntimeConfig(
  cfg: OpenClawConfig,
  pluginConfig: ResolvedMoltMarketConfig,
): { changed: boolean; nextConfig: OpenClawConfig } {
  const currentProvider = cfg.models?.providers?.[MOLT_PROXY_PROVIDER_ID];
  const nextProvider = buildMoltProxyProviderConfig(pluginConfig, currentProvider);
  const currentAgentModels = cfg.agents?.defaults?.models ?? {};
  const modelRef = `${MOLT_PROXY_PROVIDER_ID}/${pluginConfig.proxyModelId}`;
  const hasAlias = Boolean(currentAgentModels[modelRef]);
  const currentEntries = cfg.plugins?.entries ?? {};
  const currentPluginEntry = asRecord(currentEntries[MOLT_MARKET_PLUGIN_ID]);
  const currentPluginConfig = {
    ...asRecord(currentPluginEntry.config),
  };
  delete currentPluginConfig.agentId;
  const currentSubagent = asRecord(currentPluginEntry.subagent);
  const currentAllowedModels = asStringArray(currentSubagent.allowedModels);
  const hasAllowedModel = currentAllowedModels.includes(modelRef);
  const alreadyConfigured =
    currentProvider?.baseUrl === nextProvider.baseUrl &&
    currentProvider?.api === nextProvider.api &&
    hasAlias &&
    currentSubagent.allowModelOverride === true &&
    hasAllowedModel;

  if (alreadyConfigured) {
    return { changed: false, nextConfig: cfg };
  }

  return {
    changed: true,
    nextConfig: {
      ...cfg,
      models: {
        ...cfg.models,
        providers: {
          ...(cfg.models?.providers ?? {}),
          [MOLT_PROXY_PROVIDER_ID]: nextProvider,
        },
      },
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          models: {
            ...currentAgentModels,
            [modelRef]: {
              ...(asRecord(currentAgentModels[modelRef]) as Record<string, unknown>),
              alias: MOLT_MARKET_PLUGIN_ID,
            },
          },
        },
      },
      plugins: {
        ...cfg.plugins,
        entries: {
          ...currentEntries,
          [MOLT_MARKET_PLUGIN_ID]: {
            ...currentPluginEntry,
            enabled: currentPluginEntry.enabled !== false,
            config: {
              ...currentPluginConfig,
              proxyBaseUrl: pluginConfig.proxyBaseUrl,
              proxyModelId: pluginConfig.proxyModelId,
            },
            subagent: {
              ...currentSubagent,
              allowModelOverride: true,
              allowedModels: hasAllowedModel
                ? currentAllowedModels
                : [...currentAllowedModels, modelRef],
            },
          },
        },
      },
    },
  };
}
