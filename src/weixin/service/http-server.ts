import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { PluginLogger } from "openclaw/plugin-sdk/core";

import {
  DEFAULT_BASE_URL,
  getWeixinChannelReloadStatus,
  loadWeixinAccount,
  registerWeixinAccountId,
  saveWeixinAccount,
} from "../auth/accounts.js";
import {
  DEFAULT_ILINK_BOT_TYPE,
  getWeixinLoginSnapshot,
  pollWeixinLoginStatusOnce,
  startWeixinLoginWithQr,
  type WeixinQrStatusResult,
} from "../auth/login-qr.js";
import {
  detectLegacyWeixinPluginConflict,
  resolveWeixinDemoServiceConfig,
  type WeixinDemoServiceConfig,
} from "./config.js";
import { renderDemoPage } from "./page.js";
import { renderQrImageDataUrl } from "./qr-image.js";
import {
  buildDemoAccountsSnapshot,
  listRecentDemoErrors,
  type DemoAccountsSnapshot,
  type DemoChannelSummary,
} from "./state.js";
import { resolveOrRegisterWeixinUserAgent } from "./user-agent-binding.js";
import { redactToken } from "../util/redact.js";

type HttpServerDeps = {
  logger: PluginLogger;
  config: import("openclaw/plugin-sdk/core").OpenClawConfig;
};

type CompletedQrSession = {
  expiresAt: number;
  payload: Record<string, unknown>;
};

const QR_MONITOR_POLL_MS = 2_500;
const COMPLETED_QR_SESSION_TTL_MS = 10 * 60_000;

export class WeixinDemoHttpServer {
  private readonly logger: PluginLogger;
  private readonly config: import("openclaw/plugin-sdk/core").OpenClawConfig;
  private readonly serviceConfig: WeixinDemoServiceConfig;
  private readonly completedQrSessions = new Map<string, CompletedQrSession>();
  private readonly qrMonitorTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private server: Server | null = null;

  constructor(params: HttpServerDeps) {
    this.logger = params.logger;
    this.config = params.config;
    this.serviceConfig = resolveWeixinDemoServiceConfig(params.config);
  }

  async start(): Promise<void> {
    if (!this.serviceConfig.enabled) {
      this.logger.info("[ClawBNB Hub] demo service disabled");
      return;
    }
    if (this.server) {
      return;
    }
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.serviceConfig.port, this.serviceConfig.bind, () => resolve());
    });
    this.logger.info(
      `[ClawBNB Hub] demo service listening on http://${this.serviceConfig.bind}:${this.serviceConfig.port}`,
    );
  }

  async stop(): Promise<void> {
    this.clearQrSessionMonitors();
    if (!this.server) {
      return;
    }
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || "/", `http://${this.serviceConfig.bind}:${this.serviceConfig.port}`);
      if (req.method === "GET" && url.pathname === "/") {
        this.respondText(res, 200, renderDemoPage(), "text/html; charset=utf-8");
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        const snapshot = buildDemoAccountsSnapshot(this.config);
        const reload = getWeixinChannelReloadStatus();
        const pluginConflict = detectLegacyWeixinPluginConflict(this.config);
        this.respondJson(res, 200, {
          ok: true,
          gateway: {
            status: "online",
          },
          agentBinding: {
            dedicatedAgents: snapshot.summary.dedicatedAgentCount,
          },
          session: {
            dmScope: snapshot.isolation.dmScope,
            secure: snapshot.isolation.secure,
            label: snapshot.isolation.label,
          },
          service: {
            bind: this.serviceConfig.bind,
            port: this.serviceConfig.port,
            pageUrl: `http://${this.serviceConfig.bind}:${this.serviceConfig.port}/`,
          },
          runtime: snapshot.runtime,
          pluginConflict: {
            conflict: pluginConflict.conflict,
            legacyPluginEnabled: pluginConflict.legacyPluginEnabled,
            legacyPluginInstalled: pluginConflict.legacyPluginInstalled,
            message: pluginConflict.message,
          },
          restart: {
            mode: reload.mode,
            available: reload.ok,
            command: this.serviceConfig.restartCommand,
            message: reload.ok
              ? "扫码成功后会自动刷新微信通道。"
              : "当前环境无法自动刷新微信通道，请手动重启 Gateway。",
            reason: reload.reason,
          },
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/qr/create") {
        const body = await this.readJsonBody(req);
        const accountId =
          typeof body.accountId === "string" && body.accountId.trim() ? body.accountId.trim() : undefined;
        const agentToken =
          typeof body.agentToken === "string" && body.agentToken.trim() ? body.agentToken.trim() : undefined;
        const callbackUrl =
          typeof body.callbackUrl === "string" && body.callbackUrl.trim() ? body.callbackUrl.trim() : undefined;
        const force = body.force === true;
        this.logger.info(
          `[ClawBNB Hub] demo-service:qr-create accountId=${accountId ?? "(new)"} agentToken=${redactToken(agentToken)} callback=${callbackUrl ? "present" : "none"} force=${force}`,
        );
        const savedBaseUrl = accountId ? loadWeixinAccount(accountId)?.baseUrl?.trim() : "";
        const result = await startWeixinLoginWithQr({
          accountId,
          apiBaseUrl: savedBaseUrl || DEFAULT_BASE_URL,
          botType: DEFAULT_ILINK_BOT_TYPE,
          force,
          agentToken,
          callbackUrl,
        });
        const snapshot = getWeixinLoginSnapshot(result.sessionKey);
        if (!result.qrcodeUrl || !snapshot) {
          this.respondJson(res, 502, {
            ok: false,
            error: result.message || "Failed to create Weixin QR session.",
          });
          return;
        }
        this.logger.info(
          `[ClawBNB Hub] demo-service:qr-create-ok sessionKey=${redactToken(result.sessionKey)} accountId=${accountId ?? "(new)"} status=${snapshot?.status ?? "waiting"}`,
        );
        this.completedQrSessions.delete(result.sessionKey);
        this.stopQrSessionMonitor(result.sessionKey);
        this.scheduleQrSessionMonitor(result.sessionKey);
        this.respondJson(res, 200, {
          ok: true,
          message: result.message,
          sessionKey: result.sessionKey,
          qrcodeUrl: result.qrcodeUrl,
          qrImageDataUrl: result.qrcodeUrl ? await renderQrImageDataUrl(result.qrcodeUrl) : undefined,
          status: snapshot?.status ?? "waiting",
          expiresAt: snapshot?.expiresAt,
        });
        return;
      }

      const qrStatusMatch = req.method === "GET"
        ? url.pathname.match(/^\/api\/qr\/([^/]+)\/status$/)
        : null;
      if (qrStatusMatch) {
        const sessionKey = decodeURIComponent(qrStatusMatch[1] || "");
        const completed = this.getCompletedQrSessionPayload(sessionKey);
        if (completed) {
          this.respondJson(res, 200, completed);
          return;
        }
        const result = await pollWeixinLoginStatusOnce({ sessionKey });
        if (result.connected && result.botToken && result.accountId) {
          this.stopQrSessionMonitor(sessionKey);
          this.respondJson(res, 200, await this.finalizeConfirmedQrSession(sessionKey, result, "status"));
          return;
        }
        const payload = await this.buildQrStatusPayload(result);
        if (result.status === "expired" || result.status === "failed") {
          this.rememberCompletedQrSession(sessionKey, payload);
          this.stopQrSessionMonitor(sessionKey);
        }
        this.respondJson(res, 200, payload);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/accounts") {
        const snapshot = buildDemoAccountsSnapshot(this.config);
        this.respondJson(res, 200, await this.enrichSnapshotWithPublicProfiles(snapshot));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/accounts/link-agent") {
        const body = await this.readJsonBody(req);
        const accountId =
          typeof body.accountId === "string" && body.accountId.trim() ? normalizeAccountId(body.accountId) : "";
        const agentToken =
          typeof body.agentToken === "string" && body.agentToken.trim() ? body.agentToken.trim() : "";
        const callbackUrl = this.resolveAgentLinkCallbackUrl();
        this.logger.info(
          `[ClawBNB Hub] demo-service:link-agent accountId=${accountId || "(missing)"} agentToken=${redactToken(agentToken)} callback=${callbackUrl ? "present" : "none"}`,
        );

        if (!accountId || !agentToken) {
          this.respondJson(res, 400, {
            ok: false,
            error: "accountId and agentToken are required",
          });
          return;
        }

        if (!callbackUrl) {
          this.respondJson(res, 503, {
            ok: false,
            error: "MOLT_APP_BASE_URL is invalid",
          });
          return;
        }

        const result = await this.syncAgentWeixinAccount({
          agentToken,
          weixinAccountId: accountId,
          callbackUrl,
        });
        this.respondJson(res, result.ok ? 200 : 502, result);
        return;
      }

      const reloginMatch = req.method === "POST"
        ? url.pathname.match(/^\/api\/accounts\/([^/]+)\/relogin$/)
        : null;
      if (reloginMatch) {
        const accountId = decodeURIComponent(reloginMatch[1] || "");
        const savedBaseUrl = loadWeixinAccount(accountId)?.baseUrl?.trim() || DEFAULT_BASE_URL;
        const result = await startWeixinLoginWithQr({
          accountId,
          apiBaseUrl: savedBaseUrl,
          botType: DEFAULT_ILINK_BOT_TYPE,
          force: true,
        });
        const snapshot = getWeixinLoginSnapshot(result.sessionKey);
        if (!result.qrcodeUrl || !snapshot) {
          this.respondJson(res, 502, {
            ok: false,
            error: result.message || "Failed to create Weixin QR session.",
          });
          return;
        }
        this.respondJson(res, 200, {
          ok: true,
          message: result.message,
          sessionKey: result.sessionKey,
          qrcodeUrl: result.qrcodeUrl,
          qrImageDataUrl: result.qrcodeUrl ? await renderQrImageDataUrl(result.qrcodeUrl) : undefined,
          status: snapshot?.status ?? "waiting",
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/errors") {
        this.respondJson(res, 200, {
          errors: await listRecentDemoErrors(),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/gateway/restart") {
        const reload = getWeixinChannelReloadStatus();
        this.respondJson(res, 200, {
          mode: reload.mode,
          available: reload.ok,
          command: this.serviceConfig.restartCommand,
          message: reload.ok
            ? "Auto reload is enabled. Use this command only if the new account does not come online."
            : "Run the restart command after scan success.",
          reason: reload.reason,
        });
        return;
      }

      this.respondJson(res, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ClawBNB Hub] demo service error: ${message}`);
      this.respondJson(res, 500, { error: message });
    }
  }

  private async readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) {
      return {};
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  }

  private clearQrSessionMonitors(): void {
    for (const timer of this.qrMonitorTimers.values()) {
      clearTimeout(timer);
    }
    this.qrMonitorTimers.clear();
  }

  private pruneCompletedQrSessions(): void {
    const now = Date.now();
    for (const [sessionKey, entry] of this.completedQrSessions.entries()) {
      if (entry.expiresAt <= now) {
        this.completedQrSessions.delete(sessionKey);
      }
    }
  }

  private getCompletedQrSessionPayload(sessionKey: string): Record<string, unknown> | null {
    this.pruneCompletedQrSessions();
    return this.completedQrSessions.get(sessionKey)?.payload ?? null;
  }

  private rememberCompletedQrSession(sessionKey: string, payload: Record<string, unknown>): void {
    this.pruneCompletedQrSessions();
    this.completedQrSessions.set(sessionKey, {
      expiresAt: Date.now() + COMPLETED_QR_SESSION_TTL_MS,
      payload,
    });
  }

  private stopQrSessionMonitor(sessionKey: string): void {
    const timer = this.qrMonitorTimers.get(sessionKey);
    if (timer) {
      clearTimeout(timer);
      this.qrMonitorTimers.delete(sessionKey);
    }
  }

  private scheduleQrSessionMonitor(sessionKey: string): void {
    if (this.qrMonitorTimers.has(sessionKey) || this.getCompletedQrSessionPayload(sessionKey)) {
      return;
    }

    const poll = async () => {
      if (!this.qrMonitorTimers.has(sessionKey) || this.getCompletedQrSessionPayload(sessionKey)) {
        this.stopQrSessionMonitor(sessionKey);
        return;
      }

      try {
        const result = await pollWeixinLoginStatusOnce({ sessionKey });
        if (result.connected && result.botToken && result.accountId) {
          await this.finalizeConfirmedQrSession(sessionKey, result, "background");
          this.stopQrSessionMonitor(sessionKey);
          return;
        }

        if (result.status === "expired" || result.status === "failed") {
          this.rememberCompletedQrSession(sessionKey, await this.buildQrStatusPayload(result));
          this.stopQrSessionMonitor(sessionKey);
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[ClawBNB Hub] demo-service:qr-monitor failed sessionKey=${redactToken(sessionKey)} err=${message}`,
        );
      }

      if (this.qrMonitorTimers.has(sessionKey)) {
        const nextTimer = setTimeout(() => {
          void poll();
        }, QR_MONITOR_POLL_MS);
        this.qrMonitorTimers.set(sessionKey, nextTimer);
      }
    };

    const timer = setTimeout(() => {
      void poll();
    }, QR_MONITOR_POLL_MS);
    this.qrMonitorTimers.set(sessionKey, timer);
  }

  private async buildQrStatusPayload(result: WeixinQrStatusResult): Promise<Record<string, unknown>> {
    return {
      ...result,
      qrImageDataUrl: result.qrcodeUrl ? await renderQrImageDataUrl(result.qrcodeUrl) : undefined,
    };
  }

  private async finalizeConfirmedQrSession(
    sessionKey: string,
    result: WeixinQrStatusResult,
    source: "status" | "background",
  ): Promise<Record<string, unknown>> {
    const existing = this.getCompletedQrSessionPayload(sessionKey);
    if (existing && existing.connected === true) {
      return existing;
    }

    const { agentToken, callbackUrl, ...publicResult } = result;
    const normalizedId = normalizeAccountId(result.accountId || "");

    this.logger.info(
      `[ClawBNB Hub] demo-service:qr-confirmed sessionKey=${redactToken(sessionKey)} rawAccountId=${result.accountId} normalizedAccountId=${normalizedId} userId=${redactToken(result.userId)} agentToken=${redactToken(agentToken)} callback=${callbackUrl ? "present" : "none"} source=${source}`,
    );
    saveWeixinAccount(normalizedId, {
      token: result.botToken,
      baseUrl: result.baseUrl,
      userId: result.userId,
    });
    registerWeixinAccountId(normalizedId);
    const binding = await resolveOrRegisterWeixinUserAgent({
      userId: result.userId,
      accountId: normalizedId,
      config: this.config,
    });
    const platformSync = await this.syncAgentWeixinAccount({
      agentToken,
      weixinAccountId: normalizedId,
      callbackUrl,
    });
    const payload = {
      ...publicResult,
      binding,
      activation: binding.activation,
      platformSync,
      qrImageDataUrl: result.qrcodeUrl ? await renderQrImageDataUrl(result.qrcodeUrl) : undefined,
    };
    this.logger.info(
      `[ClawBNB Hub] demo-service:qr-confirmed:binding accountId=${normalizedId} bindingMode=${binding.mode} agentId=${binding.agentId} fallback=${binding.fallback} reloadMode=${binding.activation.mode} reloadTriggered=${binding.activation.triggered} platformSync=${platformSync.ok ? "ok" : platformSync.skipped ? "skipped" : "failed"} source=${source}`,
    );
    this.rememberCompletedQrSession(sessionKey, payload);
    return payload;
  }

  private async syncAgentWeixinAccount(params: {
    agentToken?: string;
    weixinAccountId: string;
    callbackUrl?: string;
  }): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const callbackUrl = params.callbackUrl?.trim();
    const agentToken = params.agentToken?.trim();
    const internalKey = process.env.INTERNAL_API_KEY?.trim();

    if (!callbackUrl || !agentToken) {
      this.logger.info(
        `[ClawBNB Hub] platform-sync:skipped weixinAccountId=${params.weixinAccountId} agentToken=${redactToken(agentToken)} callback=${callbackUrl ? "present" : "none"}`,
      );
      return { ok: false, skipped: true };
    }

    if (!internalKey) {
      this.logger.warn(
        `[ClawBNB Hub] platform-sync:missing-key weixinAccountId=${params.weixinAccountId} agentToken=${redactToken(agentToken)}`,
      );
      return { ok: false, error: "INTERNAL_API_KEY missing" };
    }

    try {
      const target = new URL(callbackUrl);
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        return { ok: false, error: "unsupported callback protocol" };
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      this.logger.info(
        `[ClawBNB Hub] platform-sync:start weixinAccountId=${params.weixinAccountId} agentToken=${redactToken(agentToken)} url=${target.origin}${target.pathname}`,
      );
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({
          agentToken,
          weixinAccountId: params.weixinAccountId,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        const error = raw || `HTTP ${response.status}`;
        this.logger.warn(`[ClawBNB Hub] platform sync failed: ${error}`);
        return { ok: false, error };
      }
      this.logger.info(
        `[ClawBNB Hub] platform-sync:ok weixinAccountId=${params.weixinAccountId} agentToken=${redactToken(agentToken)}`,
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[ClawBNB Hub] platform sync error: ${message}`);
      return { ok: false, error: message };
    }
  }

  private async enrichSnapshotWithPublicProfiles(
    snapshot: DemoAccountsSnapshot,
  ): Promise<DemoAccountsSnapshot> {
    const channels = await Promise.all(
      snapshot.channels.map(async (channel) => ({
        ...channel,
        ...(await this.fetchPublicProfileForAccount(channel.primaryAccountId)),
      })),
    );
    return {
      ...snapshot,
      channels,
    };
  }

  private async fetchPublicProfileForAccount(
    weixinAccountId: string,
  ): Promise<Pick<DemoChannelSummary, "publicProfileUrl" | "publicProfileLabel">> {
    const internalKey = process.env.INTERNAL_API_KEY?.trim();
    const baseUrl = process.env.MOLT_APP_BASE_URL?.trim() || "http://127.0.0.1:3000";

    if (!internalKey || !weixinAccountId) {
      return {};
    }

    try {
      const target = new URL("/api/internal/weixin/public-profile", baseUrl);
      target.searchParams.set("weixinAccountId", weixinAccountId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(target, {
        method: "GET",
        headers: {
          "x-internal-key": internalKey,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {};
      }

      const body = await response.json().catch(() => null) as {
        success?: boolean;
        agent?: { claimUrl?: string; displayName?: string; name?: string };
      } | null;
      const claimUrl = body?.agent?.claimUrl?.trim();
      if (!body?.success || !claimUrl) {
        return {};
      }

      return {
        publicProfileUrl: claimUrl,
        publicProfileLabel: body.agent?.displayName?.trim() || body.agent?.name?.trim() || "Agent 主页",
      };
    } catch {
      return {};
    }
  }

  private resolveAgentLinkCallbackUrl(): string | null {
    const baseUrl = process.env.MOLT_APP_BASE_URL?.trim() || "http://127.0.0.1:3000";
    try {
      return new URL("/api/v1/agents/update-weixin-account", baseUrl).toString();
    } catch {
      return null;
    }
  }

  private respondJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
    const raw = `${JSON.stringify(body, null, 2)}\n`;
    res.statusCode = statusCode;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(raw);
  }

  private respondText(
    res: ServerResponse,
    statusCode: number,
    body: string,
    contentType: string,
  ): void {
    res.statusCode = statusCode;
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store");
    res.end(body);
  }
}
