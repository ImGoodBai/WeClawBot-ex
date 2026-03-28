import type { RawData } from "ws";

export const MOLT_MARKET_PLUGIN_ID = "clawbnb-hub";
export const MOLT_PROXY_PROVIDER_ID = "molt-proxy";
export const MOLT_MARKET_SESSION_PREFIX = "clawbnb-hub:";
export const MOLT_MARKET_ORDER_TAG_PREFIX = "MOLTHUMAN_OC_ORDER_ID=";
export const MOLT_PROXY_PLACEHOLDER_API_KEY = "clawbnb-hub-runtime";
export const DEFAULT_PROXY_MODEL_ID = "molthuman-oc-chat";
export const DEFAULT_PROXY_BASE_URL = "http://127.0.0.1:9999/v1";
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
export const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;
export const DEFAULT_RECONNECT_MAX_DELAY_MS = 15_000;
export const DEFAULT_RUN_TIMEOUT_MS = 120_000;
export const DEFAULT_TEMP_ROOT = "/tmp/molt-rental";
export const DEFAULT_TOOL_REFUSAL_TEXT =
  "Tool access is disabled in rental sessions. Reply with plain text only.";

export type PresenceStatus = "offline" | "online" | "available" | "busy" | "interrupted";

export type MarketEnvelope<TPayload = Record<string, unknown>> = {
  event: string;
  payload: TPayload;
};

export type AgentRegisterPayload = {
  agentId: string;
  apiKeyHash: string;
  skillTags: string[];
  capabilityLevel: string;
  version: string;
};

export type AgentRegisterAckPayload = {
  status: string;
  configId?: string;
  reason?: string;
};

export type AgentHeartbeatPayload = {
  agentId: string;
  timestamp: number;
};

export type AgentStatusChangePayload = {
  agentId: string;
  presenceStatus: PresenceStatus;
};

export type SessionOpenPayload = {
  orderId: string;
  sessionId: string;
  buyerDisplayName: string;
  modelTier?: string;
};

export type SessionOpenAckPayload = {
  orderId: string;
  status: "accepted";
};

export type SessionMessagePayload = {
  orderId: string;
  sequenceId: number | string;
  sender: "buyer";
  content: string;
};

export type SessionReplyChunkPayload = {
  orderId: string;
  sequenceId: number | string;
  content: string;
  isFinal: boolean;
};

export type SessionClosePayload = {
  orderId: string;
  reason: string;
};

export type SessionCloseAckPayload = {
  orderId: string;
};

export function buildSessionKey(orderId: string): string {
  return `${MOLT_MARKET_SESSION_PREFIX}${orderId.trim()}`;
}

export function buildOrderTag(orderId: string): string {
  return `${MOLT_MARKET_ORDER_TAG_PREFIX}${orderId.trim()}`;
}

export function isMoltMarketSessionKey(value: string | undefined): boolean {
  return typeof value === "string" && value.startsWith(MOLT_MARKET_SESSION_PREFIX);
}

export function encodeEnvelope<TPayload>(event: string, payload: TPayload): string {
  return JSON.stringify({ event, payload } satisfies MarketEnvelope<TPayload>);
}

export function decodeEnvelope(raw: RawData | string): MarketEnvelope | null {
  try {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const event =
      typeof parsed.event === "string"
        ? parsed.event
        : typeof parsed.type === "string"
          ? parsed.type
          : "";
    const payload =
      parsed.payload && typeof parsed.payload === "object" && !Array.isArray(parsed.payload)
        ? (parsed.payload as Record<string, unknown>)
        : parsed;
    if (!event) {
      return null;
    }
    return { event, payload };
  } catch {
    return null;
  }
}
