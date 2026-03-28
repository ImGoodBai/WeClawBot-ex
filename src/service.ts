import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  OpenClawPluginApi,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginLogger,
  PluginRuntime,
} from "openclaw/plugin-sdk/core";
import WebSocket from "ws";
import {
  buildOrderTag,
  buildSessionKey,
  decodeEnvelope,
  DEFAULT_TOOL_REFUSAL_TEXT,
  encodeEnvelope,
  type AgentHeartbeatPayload,
  type AgentRegisterAckPayload,
  type AgentRegisterPayload,
  type AgentStatusChangePayload,
  type PresenceStatus,
  type SessionCloseAckPayload,
  type SessionClosePayload,
  type SessionMessagePayload,
  type SessionOpenAckPayload,
  type SessionOpenPayload,
  type SessionReplyChunkPayload,
} from "./contracts.js";
import {
  ensureMoltProxyRuntimeConfig,
  resolveMoltMarketConfig,
  resolveMoltMarketConfigFromOpenClawConfig,
  type ResolvedMoltMarketConfig,
} from "./config.js";

type WsLike = Pick<WebSocket, "on" | "send" | "close" | "readyState">;
type WsCtorLike = new (url: string) => WsLike;

type ServiceDeps = {
  WebSocketCtor: WsCtorLike;
  fetch: typeof fetch;
  now: () => number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  mkdir: typeof fs.mkdir;
  rm: typeof fs.rm;
};

type ActiveSession = {
  orderId: string;
  remoteSessionId: string;
  buyerDisplayName: string;
  modelTier?: string;
  sessionKey: string;
  tempDir: string;
  queue: Promise<void>;
  activeRunId?: string;
  closing: boolean;
};

const defaultDeps: ServiceDeps = {
  WebSocketCtor: WebSocket,
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  mkdir: fs.mkdir,
  rm: fs.rm,
};

const TRACE_FLAG_PATTERN = /^(1|true|yes|on)$/i;
const MOLT_MARKET_TRACE_ENABLED = TRACE_FLAG_PATTERN.test(process.env.MOLT_MARKET_TRACE || "");
const MOLT_MARKET_TRACE_FILE =
  process.env.MOLT_MARKET_TRACE_FILE ||
  path.join(process.cwd(), "tmp", "clawbnb-hub-trace", "plugin.jsonl");
const SERVICE_LOG_PREFIX = "[clawbnb-hub]";

let moltMarketTraceDirReady = false;
let moltMarketTraceWarned = false;

function buildRegisterPayload(config: ResolvedMoltMarketConfig, agentId: string): AgentRegisterPayload {
  return {
    agentId,
    apiKeyHash: crypto.createHash("sha256").update(config.apiKey).digest("hex"),
    skillTags: config.skillTags,
    capabilityLevel: config.capabilityLevel,
    version: config.version,
  };
}

function buildHeartbeatPayload(agentId: string, now: number): AgentHeartbeatPayload {
  return {
    agentId,
    timestamp: now,
  };
}

function buildStatusPayload(agentId: string, presenceStatus: PresenceStatus): AgentStatusChangePayload {
  return {
    agentId,
    presenceStatus,
  };
}

function resolveAssistantDelta(evt: { data: Record<string, unknown> }): string {
  return typeof evt.data?.delta === "string"
    ? evt.data.delta
    : typeof evt.data?.text === "string"
      ? evt.data.text
      : "";
}

function isMatchingAssistantEvent(
  evt: { runId: string; stream: string; sessionKey?: string },
  session: ActiveSession,
): boolean {
  if (evt.stream !== "assistant" || session.closing) {
    return false;
  }

  if (session.activeRunId) {
    return evt.runId === session.activeRunId;
  }

  return evt.sessionKey === session.sessionKey;
}

function compactTraceText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized;
}

function writeMoltMarketTrace(entry: Record<string, unknown>): void {
  if (!MOLT_MARKET_TRACE_ENABLED) {
    return;
  }

  try {
    if (!moltMarketTraceDirReady) {
      fsSync.mkdirSync(path.dirname(MOLT_MARKET_TRACE_FILE), { recursive: true });
      moltMarketTraceDirReady = true;
    }

    fsSync.appendFileSync(
      MOLT_MARKET_TRACE_FILE,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        side: "plugin",
        ...entry,
      })}\n`,
      "utf8",
    );
  } catch (error) {
    if (!moltMarketTraceWarned) {
      moltMarketTraceWarned = true;
      console.warn(
        `${SERVICE_LOG_PREFIX} failed to write trace file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export class MoltMarketServiceRuntime {
  private readonly runtime: PluginRuntime;
  private readonly logger: PluginLogger;
  private readonly deps: ServiceDeps;
  private readonly sessions = new Map<string, ActiveSession>();
  private socket: WsLike | null = null;
  private config: ResolvedMoltMarketConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private reconnectAttempt = 0;
  private registered = false;
  private currentPresence: PresenceStatus | null = null;
  private resolvedAgentId = "";
  private connectInFlight = false;

  constructor(params: {
    runtime: PluginRuntime;
    logger: PluginLogger;
    config: ResolvedMoltMarketConfig;
    deps?: Partial<ServiceDeps>;
  }) {
    this.runtime = params.runtime;
    this.logger = params.logger;
    this.config = params.config;
    this.deps = { ...defaultDeps, ...(params.deps ?? {}) };
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info(`${SERVICE_LOG_PREFIX} service disabled`);
      return;
    }
    if (!this.config.apiKey) {
      this.logger.warn(`${SERVICE_LOG_PREFIX} apiKey is empty; service will stay idle`);
      return;
    }
    if (!this.config.relayUrl) {
      this.logger.warn(`${SERVICE_LOG_PREFIX} relayUrl is empty; service will stay idle`);
      return;
    }
    void this.openSocket();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      this.deps.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    await Promise.all([...this.sessions.values()].map((session) => this.finalizeSession(session)));
    this.sessions.clear();
  }

  updateConfig(config: ResolvedMoltMarketConfig): void {
    if (config.apiKey !== this.config.apiKey || config.relayUrl !== this.config.relayUrl) {
      this.resolvedAgentId = "";
    }
    this.config = config;
  }

  private trace(entry: Record<string, unknown>): void {
    writeMoltMarketTrace(entry);
  }

  private async openSocket(): Promise<void> {
    if (this.stopped || !this.config.relayUrl || this.connectInFlight) {
      return;
    }
    this.connectInFlight = true;
    const agentId = await this.resolveAgentIdFromApiKey();
    this.connectInFlight = false;
    if (this.stopped) {
      return;
    }
    if (!agentId) {
      this.logger.warn(`${SERVICE_LOG_PREFIX} failed to resolve agentId from apiKey; retrying`);
      this.scheduleReconnect();
      return;
    }
    const socket = new this.deps.WebSocketCtor(this.config.relayUrl);
    this.socket = socket;
    socket.on("open", () => {
      this.reconnectAttempt = 0;
      this.registered = false;
      this.currentPresence = null;
      this.logger.info(`${SERVICE_LOG_PREFIX} connected ${this.config.relayUrl}`);
      this.trace({
        dir: "internal",
        event: "socket.open",
        relayUrl: this.config.relayUrl,
        agentId,
      });
      this.sendEvent("agent.register", buildRegisterPayload(this.config, agentId));
      this.startHeartbeat();
    });
    socket.on("message", (data: unknown) => {
      void this.handleIncoming(data as Parameters<typeof decodeEnvelope>[0]);
    });
    socket.on("close", () => {
      this.logger.warn(`${SERVICE_LOG_PREFIX} relay connection closed`);
      this.trace({
        dir: "internal",
        event: "socket.close",
        relayUrl: this.config.relayUrl,
        agentId: this.resolvedAgentId || agentId,
      });
      this.socket = null;
      this.registered = false;
      this.currentPresence = null;
      this.stopHeartbeat();
      this.scheduleReconnect();
    });
    socket.on("error", (error: unknown) => {
      this.logger.warn(
        `${SERVICE_LOG_PREFIX} relay socket error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.trace({
        dir: "internal",
        event: "socket.error",
        relayUrl: this.config.relayUrl,
        agentId: this.resolvedAgentId || agentId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const delay = Math.min(
      this.config.reconnectBaseDelayMs * 2 ** this.reconnectAttempt,
      this.config.reconnectMaxDelayMs,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.deps.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = this.deps.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.sendEvent("agent.heartbeat", buildHeartbeatPayload(this.resolvedAgentId, this.deps.now()));
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }
    this.deps.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendEvent<TPayload>(event: string, payload: TPayload): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const tracePayload =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    this.trace({
      dir: "out",
      event,
      orderId: typeof tracePayload.orderId === "string" ? tracePayload.orderId : undefined,
      sessionId: typeof tracePayload.sessionId === "string" ? tracePayload.sessionId : undefined,
      sequenceId:
        typeof tracePayload.sequenceId === "number" || typeof tracePayload.sequenceId === "string"
          ? Number(tracePayload.sequenceId)
          : undefined,
      agentId: typeof tracePayload.agentId === "string" ? tracePayload.agentId : undefined,
      status: typeof tracePayload.status === "string" ? tracePayload.status : undefined,
      reason: typeof tracePayload.reason === "string" ? tracePayload.reason : undefined,
      isFinal: typeof tracePayload.isFinal === "boolean" ? tracePayload.isFinal : undefined,
      contentPreview: compactTraceText(tracePayload.content),
    });
    this.socket.send(encodeEnvelope(event, payload));
  }

  private async handleIncoming(raw: Parameters<typeof decodeEnvelope>[0]): Promise<void> {
    const envelope = decodeEnvelope(raw);
    if (!envelope) {
      this.logger.warn(`${SERVICE_LOG_PREFIX} ignoring malformed relay frame`);
      return;
    }
    this.trace({
      dir: "in",
      event: envelope.event,
      orderId: typeof envelope.payload?.orderId === "string" ? envelope.payload.orderId : undefined,
      sessionId: typeof envelope.payload?.sessionId === "string" ? envelope.payload.sessionId : undefined,
      sequenceId:
        typeof envelope.payload?.sequenceId === "number" || typeof envelope.payload?.sequenceId === "string"
          ? Number(envelope.payload.sequenceId)
          : undefined,
      agentId: typeof envelope.payload?.agentId === "string" ? envelope.payload.agentId : undefined,
      status: typeof envelope.payload?.status === "string" ? envelope.payload.status : undefined,
      reason: typeof envelope.payload?.reason === "string" ? envelope.payload.reason : undefined,
      contentPreview: compactTraceText(envelope.payload?.content),
    });
    switch (envelope.event) {
      case "agent.register_ack":
        this.handleRegisterAck(envelope.payload as AgentRegisterAckPayload);
        return;
      case "agent.heartbeat_ack":
        return;
      case "session.open":
        await this.handleSessionOpen(envelope.payload as SessionOpenPayload);
        return;
      case "session.message":
        await this.handleSessionMessage(envelope.payload as SessionMessagePayload);
        return;
      case "session.close":
        await this.handleRemoteSessionClose(envelope.payload as SessionClosePayload);
        return;
      default:
        this.logger.debug?.(`${SERVICE_LOG_PREFIX} ignoring unsupported event ${envelope.event}`);
    }
  }

  private handleRegisterAck(payload: AgentRegisterAckPayload): void {
    if (payload.status !== "ok") {
      this.logger.warn(
        `${SERVICE_LOG_PREFIX} registration rejected: ${payload.reason ?? "unknown reason"}`,
      );
      return;
    }
    this.registered = true;
    this.sendPresence("online");
    this.syncPresence();
  }

  private sendPresence(status: PresenceStatus): void {
    if (!this.registered || this.currentPresence === status) {
      return;
    }
    this.currentPresence = status;
    this.sendEvent("agent.status_change", buildStatusPayload(this.resolvedAgentId, status));
  }

  private async resolveAgentIdFromApiKey(): Promise<string> {
    if (this.resolvedAgentId) {
      return this.resolvedAgentId;
    }
    let lookupUrl: URL;
    try {
      lookupUrl = new URL(this.config.relayUrl);
    } catch (error) {
      this.logger.warn(
        `${SERVICE_LOG_PREFIX} relayUrl is invalid for agent lookup: ${error instanceof Error ? error.message : String(error)}`,
      );
      return "";
    }
    lookupUrl.protocol = lookupUrl.protocol === "wss:" ? "https:" : "http:";
    lookupUrl.pathname = "/api/v1/agents/me";
    lookupUrl.search = "";
    lookupUrl.hash = "";

    try {
      const response = await this.deps.fetch(lookupUrl.toString(), {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });
      if (!response.ok) {
        this.logger.warn(
          `${SERVICE_LOG_PREFIX} agent lookup failed: HTTP ${response.status}`,
        );
        return "";
      }
      const parsed = (await response.json()) as {
        success?: boolean;
        agent?: { id?: unknown };
      };
      const agentId = typeof parsed.agent?.id === "string" ? parsed.agent.id.trim() : "";
      if (!agentId) {
        this.logger.warn(`${SERVICE_LOG_PREFIX} agent lookup returned no agent.id`);
        return "";
      }
      this.resolvedAgentId = agentId;
      return agentId;
    } catch (error) {
      this.logger.warn(
        `${SERVICE_LOG_PREFIX} agent lookup request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return "";
    }
  }

  private syncPresence(): void {
    const nextStatus: PresenceStatus = this.sessions.size > 0 ? "busy" : "available";
    this.sendPresence(nextStatus);
  }

  private async handleSessionOpen(payload: SessionOpenPayload): Promise<void> {
    if (!payload?.orderId?.trim()) {
      return;
    }
    const existing = this.sessions.get(payload.orderId);
    if (existing) {
      this.sendEvent("session.open_ack", {
        orderId: payload.orderId,
        status: "accepted",
      } satisfies SessionOpenAckPayload);
      this.syncPresence();
      return;
    }
    const sessionKey = buildSessionKey(payload.orderId);
    const tempDir = path.join(this.config.tempRoot, payload.orderId);
    const session: ActiveSession = {
      orderId: payload.orderId,
      remoteSessionId: payload.sessionId,
      buyerDisplayName: payload.buyerDisplayName,
      modelTier: payload.modelTier,
      sessionKey,
      tempDir,
      queue: Promise.resolve(),
      closing: false,
    };
    this.sessions.set(payload.orderId, session);
    this.trace({
      dir: "internal",
      event: "session.open.accepted",
      orderId: payload.orderId,
      sessionId: payload.sessionId,
    });
    try {
      await this.deps.mkdir(tempDir, { recursive: true });
    } catch (error) {
      this.sessions.delete(payload.orderId);
      throw error;
    }
    this.sendEvent("session.open_ack", {
      orderId: payload.orderId,
      status: "accepted",
    } satisfies SessionOpenAckPayload);
    this.syncPresence();
  }

  private async handleSessionMessage(payload: SessionMessagePayload): Promise<void> {
    const session = this.sessions.get(payload.orderId);
    if (!session || session.closing) {
      this.trace({
        dir: "internal",
        event: "session.message.ignored",
        orderId: payload.orderId,
        sequenceId: Number(payload.sequenceId),
        reason: session ? "session_closing" : "session_missing",
      });
      return;
    }
    this.trace({
      dir: "internal",
      event: "session.message.accepted",
      orderId: payload.orderId,
      sequenceId: Number(payload.sequenceId),
      contentPreview: compactTraceText(payload.content),
    });
    session.queue = session.queue
      .then(async () => {
        await this.runSessionTurn(session, payload);
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `${SERVICE_LOG_PREFIX} session ${payload.orderId} message failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    await session.queue;
  }

  private async runSessionTurn(
    session: ActiveSession,
    payload: SessionMessagePayload,
  ): Promise<void> {
    const off = this.runtime.events.onAgentEvent((evt) => {
      if (!isMatchingAssistantEvent(evt, session)) {
        return;
      }
      const delta = resolveAssistantDelta(evt);
      if (!delta) {
        return;
      }
      this.sendEvent("session.reply_chunk", {
        orderId: payload.orderId,
        sequenceId: payload.sequenceId,
        content: delta,
        isFinal: false,
      } satisfies SessionReplyChunkPayload);
    });

    try {
      this.trace({
        dir: "internal",
        event: "session.turn.start",
        orderId: payload.orderId,
        sequenceId: Number(payload.sequenceId),
        contentPreview: compactTraceText(payload.content),
      });
      const run = await this.runtime.subagent.run({
        sessionKey: session.sessionKey,
        message: [buildOrderTag(session.orderId), payload.content].filter(Boolean).join("\n"),
        provider: "molt-proxy",
        model: this.config.proxyModelId,
        deliver: false,
        idempotencyKey: `${payload.orderId}:${String(payload.sequenceId)}`,
        extraSystemPrompt: [
          this.config.extraSystemPrompt,
          buildOrderTag(session.orderId),
          `You are chatting with rental buyer ${session.buyerDisplayName}.`,
          `You are serving order ${session.orderId}.`,
          `Tool access is disabled. Answer in plain text only.`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
      session.activeRunId = run.runId;
      this.trace({
        dir: "internal",
        event: "subagent.run.started",
        orderId: payload.orderId,
        sequenceId: Number(payload.sequenceId),
        runId: run.runId,
        model: this.config.proxyModelId,
      });
      const outcome = await this.runtime.subagent.waitForRun({
        runId: run.runId,
        timeoutMs: this.config.runTimeoutMs,
      });
      session.activeRunId = undefined;
      this.trace({
        dir: "internal",
        event: "subagent.run.finished",
        orderId: payload.orderId,
        sequenceId: Number(payload.sequenceId),
        status: outcome.status,
        model: this.config.proxyModelId,
        error: outcome.status === "error" ? outcome.error ?? "unknown error" : undefined,
      });

      if (outcome.status === "ok") {
        this.sendEvent("session.reply_chunk", {
          orderId: payload.orderId,
          sequenceId: payload.sequenceId,
          content: "",
          isFinal: true,
        } satisfies SessionReplyChunkPayload);
      } else if (
        outcome.status === "error" &&
        (outcome.error ?? "").includes(this.config.toolRefusalText || DEFAULT_TOOL_REFUSAL_TEXT)
      ) {
        this.sendEvent("session.reply_chunk", {
          orderId: payload.orderId,
          sequenceId: payload.sequenceId,
          content: this.config.toolRefusalText,
          isFinal: true,
        } satisfies SessionReplyChunkPayload);
      } else {
        const message =
          outcome.status === "timeout"
            ? "The rental session timed out before a reply completed."
            : `Model run failed: ${outcome.error ?? "unknown error"}`;
        this.sendEvent("session.reply_chunk", {
          orderId: payload.orderId,
          sequenceId: payload.sequenceId,
          content: message,
          isFinal: true,
        } satisfies SessionReplyChunkPayload);
      }
    } catch (error) {
      this.trace({
        dir: "internal",
        event: "session.turn.error",
        orderId: payload.orderId,
        sequenceId: Number(payload.sequenceId),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      off();
      if (session.closing) {
        await this.finalizeSession(session);
      }
    }
  }

  private async handleRemoteSessionClose(payload: SessionClosePayload): Promise<void> {
    const session = this.sessions.get(payload.orderId);
    if (!session) {
      this.sendEvent("session.close_ack", { orderId: payload.orderId } satisfies SessionCloseAckPayload);
      return;
    }
    session.closing = true;
    if (!session.activeRunId) {
      await this.finalizeSession(session);
    }
    this.sendEvent("session.close_ack", { orderId: payload.orderId } satisfies SessionCloseAckPayload);
    this.syncPresence();
  }

  private async finalizeSession(session: ActiveSession): Promise<void> {
    this.sessions.delete(session.orderId);
    try {
      await this.runtime.subagent.deleteSession({
        sessionKey: session.sessionKey,
        deleteTranscript: true,
      });
    } catch (error) {
      this.logger.warn(
        `${SERVICE_LOG_PREFIX} failed to delete local session ${session.sessionKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await this.deps.rm(session.tempDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(
        `${SERVICE_LOG_PREFIX} failed to remove temp dir ${session.tempDir}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function createMoltMarketService(params: {
  api: Pick<OpenClawPluginApi, "runtime" | "logger">;
  pluginConfig: ResolvedMoltMarketConfig;
  deps?: Partial<ServiceDeps>;
}): OpenClawPluginService {
  let runtime: MoltMarketServiceRuntime | null = null;

  return {
    id: "clawbnb-hub-relay",
    async start(ctx: OpenClawPluginServiceContext): Promise<void> {
      const pluginConfig = resolveMoltMarketConfig({
        ...params.pluginConfig,
        ...resolveMoltMarketConfigFromOpenClawConfig(ctx.config),
      });
      const ensured = ensureMoltProxyRuntimeConfig(ctx.config, pluginConfig);
      if (ensured.changed) {
        await params.api.runtime.config.writeConfigFile(ensured.nextConfig);
      }
      runtime = new MoltMarketServiceRuntime({
        runtime: params.api.runtime,
        logger: params.api.logger,
        config: pluginConfig,
        deps: params.deps,
      });
      await runtime.start();
    },
    async stop(): Promise<void> {
      await runtime?.stop();
      runtime = null;
    },
  };
}
