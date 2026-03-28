import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

type CommandAuthorizer = { configured: boolean; allowed: boolean };

type CommandAuthorizationRuntime = {
  shouldComputeCommandAuthorized: (rawBody: string, cfg: OpenClawConfig) => boolean;
  resolveCommandAuthorizedFromAuthorizers: (params: {
    useAccessGroups: boolean;
    authorizers: CommandAuthorizer[];
  }) => boolean;
};

export type ResolveSenderCommandAuthorizationWithRuntimeParams = {
  cfg: OpenClawConfig;
  rawBody: string;
  isGroup: boolean;
  dmPolicy: string;
  configuredAllowFrom: string[];
  configuredGroupAllowFrom?: string[];
  senderId: string;
  isSenderAllowed: (senderId: string, allowFrom: string[]) => boolean;
  readAllowFromStore: () => Promise<string[]>;
  runtime: CommandAuthorizationRuntime;
};

type TypingCallbacks = {
  onReplyStart: () => Promise<void>;
  onIdle?: () => void;
  onCleanup?: () => void;
};

export function createTypingCallbacks(params: {
  start: () => Promise<void>;
  stop?: () => Promise<void>;
  onStartError: (err: unknown) => void;
  onStopError?: (err: unknown) => void;
  keepaliveIntervalMs?: number;
}): TypingCallbacks {
  const keepaliveIntervalMs = params.keepaliveIntervalMs ?? 3_000;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let stopSent = false;

  const clearKeepalive = () => {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  };

  const fireStart = async () => {
    try {
      await params.start();
    } catch (err) {
      params.onStartError(err);
    }
  };

  const fireStop = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearKeepalive();
    if (!params.stop || stopSent) {
      return;
    }
    stopSent = true;
    void params.stop().catch((err) => (params.onStopError ?? params.onStartError)(err));
  };

  return {
    onReplyStart: async () => {
      closed = false;
      stopSent = false;
      clearKeepalive();
      await fireStart();
      keepaliveTimer = setInterval(() => {
        void fireStart();
      }, keepaliveIntervalMs);
    },
    onIdle: fireStop,
    onCleanup: fireStop,
  };
}

function normalizeEntries(input: Array<string | number> | null | undefined): string[] {
  const result = new Set<string>();
  for (const entry of input ?? []) {
    const normalized = String(entry ?? "").trim();
    if (!normalized) {
      continue;
    }
    result.add(normalized);
  }
  return Array.from(result);
}

export function resolveDirectDmAuthorizationOutcome(params: {
  isGroup: boolean;
  dmPolicy: string;
  senderAllowedForCommands: boolean;
}): "disabled" | "unauthorized" | "allowed" {
  if (params.isGroup) {
    return "allowed";
  }
  if (params.dmPolicy === "disabled") {
    return "disabled";
  }
  if (params.dmPolicy !== "open" && !params.senderAllowedForCommands) {
    return "unauthorized";
  }
  return "allowed";
}

export async function resolveSenderCommandAuthorizationWithRuntime(
  params: ResolveSenderCommandAuthorizationWithRuntimeParams,
): Promise<{
  shouldComputeAuth: boolean;
  effectiveAllowFrom: string[];
  effectiveGroupAllowFrom: string[];
  senderAllowedForCommands: boolean;
  commandAuthorized: boolean | undefined;
}> {
  const shouldComputeAuth = params.runtime.shouldComputeCommandAuthorized(params.rawBody, params.cfg);
  const storeAllowFrom =
    !params.isGroup &&
    params.dmPolicy !== "allowlist" &&
    (params.dmPolicy !== "open" || shouldComputeAuth)
      ? await params.readAllowFromStore().catch(() => [])
      : [];

  const effectiveAllowFrom = normalizeEntries([
    ...params.configuredAllowFrom,
    ...storeAllowFrom,
  ]);
  const effectiveGroupAllowFrom = normalizeEntries(params.configuredGroupAllowFrom ?? []);

  const senderAllowedForCommands = params.isSenderAllowed(
    params.senderId,
    params.isGroup ? effectiveGroupAllowFrom : effectiveAllowFrom,
  );
  const ownerAllowedForCommands = params.isSenderAllowed(params.senderId, effectiveAllowFrom);
  const groupAllowedForCommands = params.isSenderAllowed(params.senderId, effectiveGroupAllowFrom);
  const commandAuthorized = shouldComputeAuth
    ? params.runtime.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups: params.cfg.commands?.useAccessGroups !== false,
        authorizers: [
          { configured: effectiveAllowFrom.length > 0, allowed: ownerAllowedForCommands },
          { configured: effectiveGroupAllowFrom.length > 0, allowed: groupAllowedForCommands },
        ],
      })
    : undefined;

  return {
    shouldComputeAuth,
    effectiveAllowFrom,
    effectiveGroupAllowFrom,
    senderAllowedForCommands,
    commandAuthorized,
  };
}

export function stripMarkdown(text: string): string {
  let result = text;

  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1");
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "$1");
  result = result.replace(/~~(.+?)~~/g, "$1");
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "$1");
  result = result.replace(/^>\s?(.*)$/gm, "$1");
  result = result.replace(/^[-*_]{3,}$/gm, "");
  result = result.replace(/`([^`]+)`/g, "$1");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}
