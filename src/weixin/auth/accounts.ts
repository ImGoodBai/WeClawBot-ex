import fs from "node:fs";
import path from "node:path";

import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import { getWeixinRuntime } from "../runtime.js";
import { resolveStateDir } from "../storage/state-dir.js";
import { logger } from "../util/logger.js";

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export type WeixinChannelReloadResult = {
  mode: "auto" | "manual";
  ok: boolean;
  triggered: boolean;
  configPath?: string;
  reason?: string;
  message: string;
};


// ---------------------------------------------------------------------------
// Account ID compatibility (legacy raw ID → normalized ID)
// ---------------------------------------------------------------------------

/**
 * Pattern-based reverse of normalizeWeixinAccountId for known weixin ID suffixes.
 * Used only as a compatibility fallback when loading accounts / sync bufs stored
 * under the old raw ID.
 * e.g. "b0f5860fdecb-im-bot" → "b0f5860fdecb@im.bot"
 */
export function deriveRawAccountId(normalizedId: string): string | undefined {
  if (normalizedId.endsWith("-im-bot")) {
    return `${normalizedId.slice(0, -7)}@im.bot`;
  }
  if (normalizedId.endsWith("-im-wechat")) {
    return `${normalizedId.slice(0, -10)}@im.wechat`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Account index (persistent list of registered account IDs)
// ---------------------------------------------------------------------------

function resolveWeixinStateDir(): string {
  return path.join(resolveStateDir(), "clawbnb-weixin");
}

function resolveAccountIndexPath(): string {
  return path.join(resolveWeixinStateDir(), "accounts.json");
}

/** Returns all accountIds registered via QR login. */
export function listIndexedWeixinAccountIds(): string[] {
  const filePath = resolveAccountIndexPath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.trim() !== "");
  } catch {
    return [];
  }
}

/** Add accountId to the persistent index (no-op if already present). */
export function registerWeixinAccountId(accountId: string): void {
  const dir = resolveWeixinStateDir();
  fs.mkdirSync(dir, { recursive: true });

  const existing = listIndexedWeixinAccountIds();
  if (existing.includes(accountId)) return;

  const updated = [...existing, accountId];
  fs.writeFileSync(resolveAccountIndexPath(), JSON.stringify(updated, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Account store (per-account credential files)
// ---------------------------------------------------------------------------

/** Unified per-account data: token + baseUrl in one file. */
export type WeixinAccountData = {
  token?: string;
  savedAt?: string;
  baseUrl?: string;
  /** Last linked Weixin user id from QR login (optional). */
  userId?: string;
};

function resolveAccountsDir(): string {
  return path.join(resolveWeixinStateDir(), "accounts");
}

function resolveAccountPath(accountId: string): string {
  return path.join(resolveAccountsDir(), `${accountId}.json`);
}

/**
 * Legacy single-file token: `credentials/openclaw-weixin/credentials.json` (pre per-account files).
 */
function loadLegacyToken(): string | undefined {
  const legacyPath = path.join(resolveStateDir(), "credentials", "clawbnb-weixin", "credentials.json");
  try {
    if (!fs.existsSync(legacyPath)) return undefined;
    const raw = fs.readFileSync(legacyPath, "utf-8");
    const parsed = JSON.parse(raw) as { token?: string };
    return typeof parsed.token === "string" ? parsed.token : undefined;
  } catch {
    return undefined;
  }
}

function readAccountFile(filePath: string): WeixinAccountData | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WeixinAccountData;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Load account data by ID, with compatibility fallbacks. */
export function loadWeixinAccount(accountId: string): WeixinAccountData | null {
  // Primary: try given accountId (normalized IDs written after this change).
  const primary = readAccountFile(resolveAccountPath(accountId));
  if (primary) return primary;

  // Compatibility: if the given ID is normalized, derive the old raw filename
  // (e.g. "b0f5860fdecb-im-bot" → "b0f5860fdecb@im.bot") for existing installs.
  const rawId = deriveRawAccountId(accountId);
  if (rawId) {
    const compat = readAccountFile(resolveAccountPath(rawId));
    if (compat) return compat;
  }

  // Legacy fallback: read token from old single-account credentials file.
  const token = loadLegacyToken();
  if (token) return { token };

  return null;
}

/**
 * Persist account data after QR login (merges into existing file).
 * - token: overwritten when provided.
 * - baseUrl: stored when non-empty; resolveWeixinAccount falls back to DEFAULT_BASE_URL.
 * - userId: set when `update.userId` is provided; omitted from file when cleared to empty.
 */
export function saveWeixinAccount(
  accountId: string,
  update: { token?: string; baseUrl?: string; userId?: string },
): void {
  const dir = resolveAccountsDir();
  fs.mkdirSync(dir, { recursive: true });

  const existing = loadWeixinAccount(accountId) ?? {};

  const token = update.token?.trim() || existing.token;
  const baseUrl = update.baseUrl?.trim() || existing.baseUrl;
  const userId =
    update.userId !== undefined
      ? update.userId.trim() || undefined
      : existing.userId?.trim() || undefined;

  const data: WeixinAccountData = {
    ...(token ? { token, savedAt: new Date().toISOString() } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(userId ? { userId } : {}),
  };

  const filePath = resolveAccountPath(accountId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }
}

/** Remove account data file. */
export function clearWeixinAccount(accountId: string): void {
  try {
    fs.unlinkSync(resolveAccountPath(accountId));
  } catch {
    // ignore if not found
  }
}

/**
 * Resolve the openclaw.json config file path.
 * Checks OPENCLAW_CONFIG_PATH / OPENCLAW_CONFIG env vars, then state dir.
 */
function resolveConfigPath(): string {
  const envPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || process.env.OPENCLAW_CONFIG?.trim();
  if (envPath) return envPath;
  return path.join(resolveStateDir(), "openclaw.json");
}

function buildManualReloadResult(reason: string, configPath?: string): WeixinChannelReloadResult {
  return {
    mode: "manual",
    ok: false,
    triggered: false,
    configPath,
    reason,
    message: `Auto reload unavailable: ${reason}`,
  };
}

function writeConfigJsonAtomic(configPath: string, value: Record<string, unknown>): void {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.clawbnb-weixin-reload-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  );
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, configPath);
}

export function getWeixinChannelReloadStatus(): WeixinChannelReloadResult {
  const configPath = resolveConfigPath();
  if (!configPath) {
    return buildManualReloadResult("config path is missing");
  }
  if (!fs.existsSync(configPath)) {
    return buildManualReloadResult("config file was not found", configPath);
  }
  try {
    fs.accessSync(configPath, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    return buildManualReloadResult("config file is not writable", configPath);
  }
  try {
    JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return buildManualReloadResult("config file is not valid JSON", configPath);
  }

  return {
    mode: "auto",
    ok: true,
    triggered: false,
    configPath,
    message: "Auto reload is available for channels.clawbnb-weixin.",
  };
}

/**
 * Read `routeTag` from openclaw.json (for callers without an `OpenClawConfig` object).
 * Checks per-account `channels.<id>.accounts[accountId].routeTag` first, then section-level
 * `channels.<id>.routeTag`. Matches `feat_weixin_extension` behavior; channel key is `"clawbnb-weixin"`.
 */
export function loadConfigRouteTag(accountId?: string): string | undefined {
  try {
    const configPath = resolveConfigPath();
    if (!fs.existsSync(configPath)) return undefined;
    const raw = fs.readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    const channels = cfg.channels as Record<string, unknown> | undefined;
    const section = channels?.["clawbnb-weixin"] as Record<string, unknown> | undefined;
    if (!section) return undefined;
    if (accountId) {
      const accounts = section.accounts as Record<string, Record<string, unknown>> | undefined;
      const tag = accounts?.[accountId]?.routeTag;
      if (typeof tag === "number") return String(tag);
      if (typeof tag === "string" && tag.trim()) return tag.trim();
    }
    if (typeof section.routeTag === "number") return String(section.routeTag);
    return typeof section.routeTag === "string" && section.routeTag.trim()
      ? section.routeTag.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reports whether config-triggered channel reload is available.
 * Actual reload nonce writes now happen inside the locked account-binding flow.
 */
export async function triggerWeixinChannelReload(): Promise<WeixinChannelReloadResult> {
  const status = getWeixinChannelReloadStatus();
  if (!status.ok || !status.configPath) {
    logger.warn(`[reload] ${status.message}`);
    return status;
  }

  logger.info(`[reload] ${status.message}`);
  return status;
}

// ---------------------------------------------------------------------------
// Account resolution (merge config + stored credentials)
// ---------------------------------------------------------------------------

export type ResolvedWeixinAccount = {
  accountId: string;
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
  enabled: boolean;
  /** true when a token has been obtained via QR login. */
  configured: boolean;
  name?: string;
};

type WeixinAccountConfig = {
  name?: string;
  enabled?: boolean;
  cdnBaseUrl?: string;
  /** Optional SKRouteTag source; read from openclaw.json when `accountId` is passed to `loadConfigRouteTag`. */
  routeTag?: number | string;
};

type WeixinSectionConfig = WeixinAccountConfig & {
  accounts?: Record<string, WeixinAccountConfig>;
};

/** List accountIds from the index file (written at QR login). */
export function listWeixinAccountIds(_cfg: OpenClawConfig): string[] {
  return listIndexedWeixinAccountIds();
}

/** Resolve a weixin account by ID, merging config and stored credentials. */
export function resolveWeixinAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedWeixinAccount {
  const raw = accountId?.trim();
  if (!raw) {
    throw new Error("weixin: accountId is required (no default account)");
  }
  const id = normalizeAccountId(raw);
  const section = cfg.channels?.["clawbnb-weixin"] as WeixinSectionConfig | undefined;
  const accountCfg: WeixinAccountConfig = section?.accounts?.[id] ?? section ?? {};

  const accountData = loadWeixinAccount(id);
  const token = accountData?.token?.trim() || undefined;
  const stateBaseUrl = accountData?.baseUrl?.trim() || "";

  return {
    accountId: id,
    baseUrl: stateBaseUrl || DEFAULT_BASE_URL,
    cdnBaseUrl: accountCfg.cdnBaseUrl?.trim() || CDN_BASE_URL,
    token,
    enabled: accountCfg.enabled !== false,
    configured: Boolean(token),
    name: accountCfg.name?.trim() || undefined,
  };
}
