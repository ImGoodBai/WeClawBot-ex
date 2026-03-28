import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import { resolveStateDir } from "../storage/state-dir.js";

const MAP_VERSION = 1;
const CHANNEL_ID = "clawbnb-weixin";
const DEFAULT_AGENT_ID = "main";
const DEFAULT_MAX_AGENTS = 20;
const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_MS = 120;
const LOCK_MAX_RETRIES = 50;

export type WeixinAgentBindingConfig = {
  enabled: boolean;
  maxAgents: number;
};

export type WeixinChannelActivationResult = {
  mode: "auto" | "manual";
  ok: boolean;
  available: boolean;
  triggered: boolean;
  configPath?: string;
  reason?: string;
  message: string;
};

export type WeixinUserAgentBindingRecord = {
  userId: string;
  agentId: string;
  activeAccountId: string;
  historyAccountIds: string[];
  createdAt: string;
  updatedAt: string;
};

type WeixinUserAgentBindingMap = {
  version: number;
  users: Record<string, WeixinUserAgentBindingRecord>;
};

export type WeixinUserAgentBindingResult = {
  enabled: boolean;
  mode: "dedicated" | "shared";
  agentId: string;
  userId?: string;
  created: boolean;
  fallback: boolean;
  reason?: string;
  configPath?: string;
  mapPath: string;
  activation: WeixinChannelActivationResult;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveWeixinStateDir(): string {
  return path.join(resolveStateDir(), CHANNEL_ID);
}

function resolveConfigPath(): string {
  const envPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || process.env.OPENCLAW_CONFIG?.trim();
  if (envPath) return envPath;
  return path.join(resolveStateDir(), "openclaw.json");
}

function resolveUserAgentMapPath(): string {
  return path.join(resolveWeixinStateDir(), "user-agent-map.json");
}

function loadCurrentConfigObject(): Record<string, unknown> {
  const configPath = resolveConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.clawbnb-hub-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  );
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function buildManualActivationResult(reason: string, configPath?: string): WeixinChannelActivationResult {
  return {
    mode: "manual",
    ok: false,
    available: false,
    triggered: false,
    configPath,
    reason,
    message: `Auto reload unavailable: ${reason}`,
  };
}

function buildAutoActivationResult(configPath: string, triggered: boolean): WeixinChannelActivationResult {
  return {
    mode: "auto",
    ok: true,
    available: true,
    triggered,
    configPath,
    message: triggered
      ? "Channel reload requested via channels.clawbnb-weixin.demoService.reloadNonce."
      : "Auto reload is available for channels.clawbnb-weixin.",
  };
}

function touchChannelReloadNonce(config: Record<string, unknown>): void {
  const channels = ensureObject(config.channels);
  const section = ensureObject(channels[CHANNEL_ID]);
  const demoService = ensureObject(section.demoService);

  config.channels = {
    ...channels,
    [CHANNEL_ID]: {
      ...section,
      demoService: {
        ...demoService,
        reloadNonce: new Date().toISOString(),
      },
    },
  };
}

function ensureSafeDmScope(config: Record<string, unknown>): void {
  const session = ensureObject(config.session);
  const current = typeof session.dmScope === "string" ? session.dmScope.trim() : "";
  if (!current || current === "main") {
    config.session = {
      ...session,
      dmScope: "per-account-channel-peer",
    };
  }
}

async function withFileLock<T>(filePath: string, task: () => Promise<T> | T): Promise<T> {
  const lockPath = `${filePath}.lock`;

  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.closeSync(fd);
      try {
        return await task();
      } finally {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // best-effort
        }
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") {
        throw error;
      }
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        // Another process may have removed it between stat and unlink.
      }
      await sleep(LOCK_RETRY_MS);
    }
  }

  throw new Error(`failed to acquire config lock for ${filePath}`);
}

function buildAgentId(userId: string): string {
  const digest = crypto.createHash("sha1").update(userId).digest("hex").slice(0, 8);
  return `wx-${digest}`;
}

function normalizeBindingConfig(rawConfig?: OpenClawConfig | Record<string, unknown>): WeixinAgentBindingConfig {
  const root = ensureObject(rawConfig);
  const channels = ensureObject(root.channels);
  const section = ensureObject(channels[CHANNEL_ID]);
  const binding = ensureObject(section.agentBinding);
  const maxAgents =
    typeof binding.maxAgents === "number" &&
    Number.isInteger(binding.maxAgents) &&
    binding.maxAgents > 0
      ? binding.maxAgents
      : DEFAULT_MAX_AGENTS;

  return {
    enabled: typeof binding.enabled === "boolean" ? binding.enabled : true,
    maxAgents,
  };
}

export function resolveWeixinAgentBindingConfig(
  rawConfig?: OpenClawConfig | Record<string, unknown>,
): WeixinAgentBindingConfig {
  return normalizeBindingConfig(rawConfig);
}

export function loadWeixinUserAgentBindingMap(): WeixinUserAgentBindingMap {
  const mapPath = resolveUserAgentMapPath();
  try {
    if (!fs.existsSync(mapPath)) {
      return { version: MAP_VERSION, users: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(mapPath, "utf-8")) as WeixinUserAgentBindingMap;
    const users = ensureObject(parsed.users) as Record<string, WeixinUserAgentBindingRecord>;
    return {
      version: MAP_VERSION,
      users,
    };
  } catch {
    return { version: MAP_VERSION, users: {} };
  }
}

function saveWeixinUserAgentBindingMap(map: WeixinUserAgentBindingMap): void {
  writeJsonAtomic(resolveUserAgentMapPath(), map);
}

function ensureAgentListEntries(config: Record<string, unknown>, agentIds: string[]): void {
  const agents = ensureObject(config.agents);
  const list = Array.isArray(agents.list) ? [...agents.list] : [];
  const knownIds = new Set<string>();

  for (const entry of list) {
    if (typeof entry === "string" && entry.trim()) {
      knownIds.add(entry.trim());
      continue;
    }
    const item = ensureObject(entry);
    if (typeof item.id === "string" && item.id.trim()) {
      knownIds.add(item.id.trim());
    }
  }

  for (const agentId of agentIds) {
    if (!knownIds.has(agentId)) {
      list.push({ id: agentId });
      knownIds.add(agentId);
    }
  }

  config.agents = {
    ...agents,
    list,
  };
}

function ensureAccountBinding(params: {
  config: Record<string, unknown>;
  accountId: string;
  previousAccountId?: string;
  agentId: string;
}): void {
  const bindings = Array.isArray(params.config.bindings) ? [...params.config.bindings] : [];
  const filtered = bindings.filter((binding) => {
    const item = ensureObject(binding);
    const match = ensureObject(item.match);
    if (match.channel !== CHANNEL_ID) {
      return true;
    }
    if (item.agentId === params.agentId) {
      return false;
    }
    if (typeof match.accountId === "string" && match.accountId === params.accountId) {
      return false;
    }
    if (params.previousAccountId && typeof match.accountId === "string" && match.accountId === params.previousAccountId) {
      return false;
    }
    return true;
  });

  filtered.push({
    match: {
      channel: CHANNEL_ID,
      accountId: params.accountId,
    },
    agentId: params.agentId,
  });

  params.config.bindings = filtered;
}

export function getWeixinUserAgentBinding(params: {
  userId?: string;
  accountId?: string;
  config?: OpenClawConfig | Record<string, unknown>;
}): WeixinUserAgentBindingResult {
  const bindingConfig = normalizeBindingConfig(params.config ?? loadCurrentConfigObject());
  const map = loadWeixinUserAgentBindingMap();
  const trimmedUserId = params.userId?.trim();
  const fallback = (reason?: string): WeixinUserAgentBindingResult => ({
    enabled: bindingConfig.enabled,
    mode: "shared",
    agentId: DEFAULT_AGENT_ID,
    userId: trimmedUserId,
    created: false,
    fallback: true,
    reason,
    configPath: resolveConfigPath(),
    mapPath: resolveUserAgentMapPath(),
    activation: buildAutoActivationResult(resolveConfigPath(), false),
  });

  if (!bindingConfig.enabled) {
    return fallback("agent binding is disabled");
  }
  if (!trimmedUserId) {
    return fallback("stable weixin userId is missing");
  }

  const existing = map.users[trimmedUserId];
  if (!existing) {
    return fallback("no dedicated agent is registered for this user yet");
  }

  return {
    enabled: true,
    mode: "dedicated",
    agentId: existing.agentId,
    userId: trimmedUserId,
    created: false,
    fallback: false,
    configPath: resolveConfigPath(),
    mapPath: resolveUserAgentMapPath(),
    activation: buildAutoActivationResult(resolveConfigPath(), false),
  };
}

export async function resolveOrRegisterWeixinUserAgent(params: {
  userId?: string;
  accountId: string;
  config?: OpenClawConfig | Record<string, unknown>;
}): Promise<WeixinUserAgentBindingResult> {
  const bindingConfig = normalizeBindingConfig(params.config ?? loadCurrentConfigObject());
  const trimmedUserId = params.userId?.trim();
  const mapPath = resolveUserAgentMapPath();
  const configPath = resolveConfigPath();
  const fallback = (reason?: string): WeixinUserAgentBindingResult => ({
    enabled: bindingConfig.enabled,
    mode: "shared",
    agentId: DEFAULT_AGENT_ID,
    userId: trimmedUserId,
    created: false,
    fallback: true,
    reason,
    configPath,
    mapPath,
    activation: buildManualActivationResult(reason ?? "config update skipped", configPath),
  });

  if (!fs.existsSync(configPath)) {
    return fallback("openclaw config file was not found");
  }

  return await withFileLock(configPath, async () => {
    let currentConfig: Record<string, unknown>;
    try {
      currentConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      return fallback("openclaw config file is not valid JSON");
    }
    const currentBindingConfig = normalizeBindingConfig(currentConfig);
    const map = loadWeixinUserAgentBindingMap();
    const currentActivation = buildAutoActivationResult(configPath, true);

    if (!currentBindingConfig.enabled) {
      ensureSafeDmScope(currentConfig);
      touchChannelReloadNonce(currentConfig);
      writeJsonAtomic(configPath, currentConfig);
      return {
        enabled: false,
        mode: "shared",
        agentId: DEFAULT_AGENT_ID,
        userId: trimmedUserId,
        created: false,
        fallback: true,
        reason: "agent binding is disabled",
        configPath,
        mapPath,
        activation: currentActivation,
      };
    }

    if (!trimmedUserId) {
      ensureSafeDmScope(currentConfig);
      touchChannelReloadNonce(currentConfig);
      writeJsonAtomic(configPath, currentConfig);
      return {
        enabled: true,
        mode: "shared",
        agentId: DEFAULT_AGENT_ID,
        userId: trimmedUserId,
        created: false,
        fallback: true,
        reason: "stable weixin userId is missing",
        configPath,
        mapPath,
        activation: currentActivation,
      };
    }

    const existing = map.users[trimmedUserId];
    if (!existing && Object.keys(map.users).length >= currentBindingConfig.maxAgents) {
      ensureSafeDmScope(currentConfig);
      touchChannelReloadNonce(currentConfig);
      writeJsonAtomic(configPath, currentConfig);
      return {
        enabled: true,
        mode: "shared",
        agentId: DEFAULT_AGENT_ID,
        userId: trimmedUserId,
        created: false,
        fallback: true,
        reason: `maxAgents=${currentBindingConfig.maxAgents} reached`,
        configPath,
        mapPath,
        activation: currentActivation,
      };
    }

    const now = new Date().toISOString();
    const agentId = existing?.agentId ?? buildAgentId(trimmedUserId);
    const previousAccountId = existing?.activeAccountId;
    const historyAccountIds = new Set<string>(existing?.historyAccountIds ?? []);
    if (previousAccountId) {
      historyAccountIds.add(previousAccountId);
    }
    historyAccountIds.add(params.accountId);

    ensureAgentListEntries(currentConfig, [DEFAULT_AGENT_ID, agentId]);
    ensureAccountBinding({
      config: currentConfig,
      accountId: params.accountId,
      previousAccountId,
      agentId,
    });
    ensureSafeDmScope(currentConfig);
    touchChannelReloadNonce(currentConfig);
    writeJsonAtomic(configPath, currentConfig);

    map.users[trimmedUserId] = {
      userId: trimmedUserId,
      agentId,
      activeAccountId: params.accountId,
      historyAccountIds: [...historyAccountIds],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    saveWeixinUserAgentBindingMap(map);

    return {
      enabled: true,
      mode: "dedicated",
      agentId,
      userId: trimmedUserId,
      created: !existing,
      fallback: false,
      configPath,
      mapPath,
      activation: currentActivation,
    };
  });
}
