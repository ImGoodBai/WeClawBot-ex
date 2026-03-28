import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import {
  listIndexedWeixinAccountIds,
  loadWeixinAccount,
} from "../auth/accounts.js";
import { getRemainingPauseMs, isSessionPaused, SESSION_EXPIRED_ERRCODE } from "../api/session-guard.js";
import { resolveStateDir } from "../storage/state-dir.js";
import {
  getWeixinUserAgentBinding,
  resolveWeixinAgentBindingConfig,
} from "./user-agent-binding.js";
import { detectLegacyWeixinPluginConflict } from "./config.js";
import { logger } from "../util/logger.js";

export type DemoAccountRecord = {
  accountId: string;
  accountShortId: string;
  configured: boolean;
  baseUrl?: string;
  userId?: string;
  userLabel: string;
  savedAt?: string;
  cooldownActive: boolean;
  cooldownRemainingMinutes: number;
  cooldownErrcode?: number;
};

export type DemoChannelSummary = {
  channelKey: string;
  identityLabel: string;
  userId?: string;
  primaryAccountId: string;
  primaryAccountShortId: string;
  latestSavedAt?: string;
  linkedAccountCount: number;
  duplicateRecordCount: number;
  cooldownActive: boolean;
  cooldownRemainingMinutes: number;
  cooldownRecordCount: number;
  cooldownErrcode?: number;
  agentId: string;
  bindingMode: "dedicated" | "shared";
  bindingEnabled: boolean;
  bindingFallback: boolean;
  bindingReason?: string;
  publicProfileUrl?: string;
  publicProfileLabel?: string;
  records: DemoAccountRecord[];
};

export type DemoDiagnosticItem = {
  kind:
    | "cooldown"
    | "duplicate"
    | "missing-user-id"
    | "session-scope"
    | "plugin-conflict"
    | "runtime-state";
  severity: "danger" | "warn" | "info";
  title: string;
  message: string;
};

export type DemoIsolationState = {
  dmScope: string;
  secure: boolean;
  label: string;
};

export type DemoRuntimeState = {
  stateDir: string;
  configPath: string;
  stateDirSource: "env" | "default-home";
  configPathSource: "env" | "state-dir-default";
  stateDirPinned: boolean;
  configPathPinned: boolean;
  pid: number;
};

export type DemoAccountsSnapshot = {
  summary: {
    totalStoredRecords: number;
    uniqueChannels: number;
    duplicateChannelCount: number;
    cooldownChannelCount: number;
    dedicatedAgentCount: number;
  };
  isolation: DemoIsolationState;
  runtime: DemoRuntimeState;
  channels: DemoChannelSummary[];
  records: DemoAccountRecord[];
  diagnostics: DemoDiagnosticItem[];
};

export type DemoErrorEntry = {
  time: string;
  level: string;
  message: string;
};

function shortAccountId(accountId: string): string {
  return accountId.length > 18 ? `${accountId.slice(0, 6)}...${accountId.slice(-6)}` : accountId;
}

function maskUserId(userId?: string): string {
  const value = userId?.trim();
  if (!value) {
    return "Unidentified Weixin user";
  }
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function toTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareSavedAtDesc(a: { savedAt?: string }, b: { savedAt?: string }): number {
  return toTimestamp(b.savedAt) - toTimestamp(a.savedAt);
}

function compareLatestSavedAtDesc(
  a: { latestSavedAt?: string },
  b: { latestSavedAt?: string },
): number {
  return toTimestamp(b.latestSavedAt) - toTimestamp(a.latestSavedAt);
}

function buildAccountRecords(): DemoAccountRecord[] {
  return listIndexedWeixinAccountIds()
    .map((accountId) => {
      const account = loadWeixinAccount(accountId);
      const cooldownRemainingMs = getRemainingPauseMs(accountId);
      const cooldownActive = isSessionPaused(accountId);
      return {
        accountId,
        accountShortId: shortAccountId(accountId),
        configured: Boolean(account?.token),
        baseUrl: account?.baseUrl,
        userId: account?.userId,
        userLabel: maskUserId(account?.userId),
        savedAt: account?.savedAt,
        cooldownActive,
        cooldownRemainingMinutes: Math.ceil(cooldownRemainingMs / 60_000),
        cooldownErrcode: cooldownActive ? SESSION_EXPIRED_ERRCODE : undefined,
      };
    })
    .sort(compareSavedAtDesc);
}

function buildIsolationState(cfg?: OpenClawConfig): DemoIsolationState {
  const dmScope = cfg?.session?.dmScope ?? "main";
  if (dmScope === "per-account-channel-peer") {
    return {
      dmScope,
      secure: true,
      label: "账号级会话隔离",
    };
  }
  if (dmScope === "per-channel-peer") {
    return {
      dmScope,
      secure: true,
      label: "按渠道与联系人隔离",
    };
  }
  if (dmScope === "per-peer") {
    return {
      dmScope,
      secure: true,
      label: "按联系人隔离",
    };
  }
  return {
    dmScope,
    secure: false,
    label: "共享主会话",
  };
}

export function resolveDemoRuntimeState(): DemoRuntimeState {
  const envStateDir = process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim() || "";
  const envConfigPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || process.env.OPENCLAW_CONFIG?.trim() || "";
  const stateDir = resolveStateDir();
  const configPath = envConfigPath || path.join(stateDir, "openclaw.json");

  return {
    stateDir,
    configPath,
    stateDirSource: envStateDir ? "env" : "default-home",
    configPathSource: envConfigPath ? "env" : "state-dir-default",
    stateDirPinned: Boolean(envStateDir),
    configPathPinned: Boolean(envConfigPath),
    pid: process.pid,
  };
}

export function buildDemoAccountsSnapshot(cfg?: OpenClawConfig): DemoAccountsSnapshot {
  const records = buildAccountRecords();
  const isolation = buildIsolationState(cfg);
  const runtime = resolveDemoRuntimeState();
  const agentBinding = resolveWeixinAgentBindingConfig(cfg);
  const pluginConflict = cfg ? detectLegacyWeixinPluginConflict(cfg) : { conflict: false };
  const grouped = new Map<string, DemoAccountRecord[]>();

  for (const record of records) {
    const key = record.userId?.trim() || record.accountId;
    const current = grouped.get(key) ?? [];
    current.push(record);
    grouped.set(key, current);
  }

  const channels = [...grouped.entries()]
    .map(([channelKey, channelRecords]) => {
      const sortedRecords = [...channelRecords].sort(compareSavedAtDesc);
      const primary = sortedRecords[0];
      const cooldownRecordCount = sortedRecords.filter((record) => record.cooldownActive).length;
      const binding = getWeixinUserAgentBinding({
        userId: primary.userId,
        accountId: primary.accountId,
        config: cfg,
      });
      return {
        channelKey,
        identityLabel: primary.userLabel,
        userId: primary.userId,
        primaryAccountId: primary.accountId,
        primaryAccountShortId: primary.accountShortId,
        latestSavedAt: primary.savedAt,
        linkedAccountCount: sortedRecords.length,
        duplicateRecordCount: Math.max(0, sortedRecords.length - 1),
        cooldownActive: primary.cooldownActive,
        cooldownRemainingMinutes: primary.cooldownRemainingMinutes,
        cooldownRecordCount,
        cooldownErrcode: primary.cooldownActive ? primary.cooldownErrcode : undefined,
        agentId: binding.agentId,
        bindingMode: binding.mode,
        bindingEnabled: binding.enabled,
        bindingFallback: binding.fallback,
        bindingReason: binding.reason,
        records: sortedRecords,
      } satisfies DemoChannelSummary;
    })
    .sort(compareLatestSavedAtDesc);

  const diagnostics: DemoDiagnosticItem[] = [];

  if (!isolation.secure) {
    diagnostics.push({
      kind: "session-scope",
      severity: "danger",
      title: "Shared main session mode",
      message: `Direct messages currently share one main agent session (dmScope=${isolation.dmScope}). Use per-account-channel-peer before running multiple Weixin accounts in one Gateway.`,
    });
  }

  if (!runtime.stateDirPinned) {
    diagnostics.push({
      kind: "runtime-state",
      severity: "danger",
      title: "State dir not pinned",
      message:
        `Gateway is using the default state dir (${path.join(os.homedir(), ".openclaw")}) because OPENCLAW_STATE_DIR is unset. ` +
        `This can mix unrelated local runs and make the Weixin console show the wrong account history.`,
    });
  } else if (!runtime.configPathPinned) {
    diagnostics.push({
      kind: "runtime-state",
      severity: "warn",
      title: "Config path not pinned",
      message:
        `Gateway state is pinned to ${runtime.stateDir}, but OPENCLAW_CONFIG_PATH is unset. ` +
        `Keep config and state pinned together to avoid loading a stale config after restart.`,
    });
  }

  if (pluginConflict.conflict) {
    diagnostics.push({
      kind: "plugin-conflict",
      severity: "danger",
      title: "Legacy plugin conflict detected",
      message:
        "Legacy molthuman-oc-plugin is still enabled in this OpenClaw profile. Disable it before using clawbnb-hub in the same profile, or use a separate OPENCLAW_STATE_DIR.",
    });
  }

  if (agentBinding.enabled) {
    const fallbackChannels = channels.filter((channel) => channel.bindingFallback);
    if (fallbackChannels.length > 0) {
      diagnostics.push({
        kind: "missing-user-id",
        severity: "warn",
        title: "Some channels still use the shared agent",
        message: `${fallbackChannels.length} channel(s) are still routed to ${fallbackChannels[0]?.agentId ?? "main"} because dedicated agent binding could not be completed.`,
      });
    }
  }

  for (const channel of channels) {
    if (channel.duplicateRecordCount > 0) {
      diagnostics.push({
        kind: "duplicate",
        severity: "info",
        title: "Duplicate history grouped",
        message: `${channel.identityLabel} has ${channel.linkedAccountCount} stored bot sessions. The newest one is shown as the active channel.`,
      });
    }
    if (channel.cooldownRecordCount > 0) {
      diagnostics.push({
        kind: "cooldown",
        severity: "danger",
        title: "Weixin cooldown detected",
        message: `${channel.identityLabel} has ${channel.cooldownRecordCount} session record(s) paused by errcode ${SESSION_EXPIRED_ERRCODE}. Affected sessions wait about 60 minutes before retry.`,
      });
    }
    if (!channel.userId) {
      diagnostics.push({
        kind: "missing-user-id",
        severity: "warn",
        title: "User identity missing",
        message: `${channel.primaryAccountShortId} has no stable Weixin userId saved yet, so it cannot be deduplicated confidently.`,
      });
    }
  }

  return {
    summary: {
      totalStoredRecords: records.length,
      uniqueChannels: channels.length,
      duplicateChannelCount: channels.filter((channel) => channel.duplicateRecordCount > 0).length,
      cooldownChannelCount: channels.filter((channel) => channel.cooldownRecordCount > 0).length,
      dedicatedAgentCount: channels.filter((channel) => channel.bindingMode === "dedicated").length,
    },
    isolation,
    runtime,
    channels,
    records,
    diagnostics,
  };
}

export async function listRecentDemoErrors(limit = 8): Promise<DemoErrorEntry[]> {
  try {
    const logPath = logger.getLogFilePath();
    const raw = await fs.readFile(logPath, "utf8");
    const lines = raw.trim().split("\n");
    const entries: DemoErrorEntry[] = [];
    const seen = new Set<string>();

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as {
          "0"?: string;
          "1"?: string;
          time?: string;
          _meta?: { logLevelName?: string };
        };
        const loggerName = parsed["0"] ?? "";
        const level = parsed._meta?.logLevelName ?? "INFO";
        const message = parsed["1"] ?? "";
        if (!loggerName.includes("clawbnb-weixin")) {
          continue;
        }
        if (level !== "ERROR" && level !== "WARN" && !message.includes(String(SESSION_EXPIRED_ERRCODE))) {
          continue;
        }
        const dedupeKey = `${level}|${message}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        entries.push({
          time: parsed.time ?? new Date().toISOString(),
          level,
          message,
        });
        if (entries.length >= limit) {
          break;
        }
      } catch {
        continue;
      }
    }

    return entries;
  } catch {
    return [];
  }
}
