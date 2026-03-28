// Based on @tencent-weixin/openclaw-weixin v2.0.1.
// Modifications: multi-session QR management and login snapshot/status helpers.

import { randomUUID } from "node:crypto";

import { loadConfigRouteTag } from "./accounts.js";
import { logger } from "../util/logger.js";
import { redactToken } from "../util/redact.js";

type ActiveLogin = {
  sessionKey: string;
  id: string;
  qrcode: string;
  qrcodeUrl: string;
  startedAt: number;
  apiBaseUrl: string;
  agentToken?: string;
  callbackUrl?: string;
  botToken?: string;
  status?: "wait" | "scaned" | "confirmed" | "expired";
  lastObservedStatus?: "wait" | "scaned" | "confirmed" | "expired";
  error?: string;
};

const ACTIVE_LOGIN_TTL_MS = 5 * 60_000;
/** Client-side timeout for the default long-poll get_qrcode_status request. */
const QR_LONG_POLL_TIMEOUT_MS = 35_000;
/** Short timeout used by the demo HTTP polling API so the browser can render QR quickly. */
const QR_DEMO_POLL_TIMEOUT_MS = 2_000;

/** Default `bot_type` for ilink get_bot_qrcode / get_qrcode_status (this channel build). */
export const DEFAULT_ILINK_BOT_TYPE = "3";

const activeLogins = new Map<string, ActiveLogin>();

interface QRCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

interface StatusResponse {
  status: "wait" | "scaned" | "confirmed" | "expired";
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  /** The user ID of the person who scanned the QR code. */
  ilink_user_id?: string;
}

function isLoginFresh(login: ActiveLogin): boolean {
  return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}

function formatLoginScope(login: Pick<ActiveLogin, "sessionKey" | "agentToken" | "callbackUrl"> & {
  accountId?: string;
}): string {
  return [
    `sessionKey=${redactToken(login.sessionKey)}`,
    login.accountId ? `accountId=${login.accountId}` : "",
    login.agentToken ? `agentToken=${redactToken(login.agentToken)}` : "",
    login.callbackUrl ? "callback=present" : "callback=none",
  ]
    .filter(Boolean)
    .join(" ");
}

function logQrStatusTransition(
  login: ActiveLogin,
  nextStatus: NonNullable<ActiveLogin["status"]>,
  extras: Record<string, string | undefined> = {},
): void {
  if (login.lastObservedStatus === nextStatus) {
    return;
  }
  const extraParts = Object.entries(extras)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${value}`);
  logger.info(
    [
      `qr-status: transition`,
      formatLoginScope(login),
      `from=${login.lastObservedStatus ?? "(none)"}`,
      `to=${nextStatus}`,
      ...extraParts,
    ].join(" "),
  );
  login.lastObservedStatus = nextStatus;
}

/** Remove all expired entries from the activeLogins map to prevent memory leaks. */
function purgeExpiredLogins(): void {
  for (const [id, login] of activeLogins) {
    if (!isLoginFresh(login)) {
      activeLogins.delete(id);
    }
  }
}

async function fetchQRCode(apiBaseUrl: string, botType: string): Promise<QRCodeResponse> {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const url = new URL(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`, base);
  logger.info(`Fetching QR code from: ${url.toString()}`);

  const headers: Record<string, string> = {};
  const routeTag = loadConfigRouteTag();
  if (routeTag) {
    headers.SKRouteTag = routeTag;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "(unreadable)");
    logger.error(`QR code fetch failed: ${response.status} ${response.statusText} body=${body}`);
    throw new Error(`Failed to fetch QR code: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function pollQRStatus(
  apiBaseUrl: string,
  qrcode: string,
  timeoutMs = QR_LONG_POLL_TIMEOUT_MS,
): Promise<StatusResponse> {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const url = new URL(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, base);
  logger.debug(`Long-poll QR status from: ${url.toString()}`);

  const headers: Record<string, string> = {
    "iLink-App-ClientVersion": "1",
  };
  const routeTag = loadConfigRouteTag();
  if (routeTag) {
    headers.SKRouteTag = routeTag;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url.toString(), { headers, signal: controller.signal });
    clearTimeout(timer);
    logger.debug(`pollQRStatus: HTTP ${response.status}, reading body...`);
    const rawText = await response.text();
    logger.debug(`pollQRStatus: body=${rawText.substring(0, 200)}`);
    if (!response.ok) {
      logger.error(`QR status poll failed: ${response.status} ${response.statusText} body=${rawText}`);
      throw new Error(`Failed to poll QR status: ${response.status} ${response.statusText}`);
    }
    return JSON.parse(rawText) as StatusResponse;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      logger.debug(`pollQRStatus: client-side timeout after ${timeoutMs}ms, returning wait`);
      return { status: "wait" };
    }
    throw err;
  }
}

export type WeixinQrStartResult = {
  qrcodeUrl?: string;
  message: string;
  sessionKey: string;
};

export type WeixinQrWaitResult = {
  connected: boolean;
  botToken?: string;
  accountId?: string;
  baseUrl?: string;
  /** The user ID of the person who scanned the QR code; add to allowFrom. */
  userId?: string;
  message: string;
};

export type WeixinLoginSnapshot = {
  sessionKey: string;
  qrcodeUrl: string;
  startedAt: number;
  expiresAt: number;
  status: "waiting" | "scanned" | "confirmed" | "expired" | "failed";
  rawStatus?: ActiveLogin["status"];
  error?: string;
};

export type WeixinQrStatusResult = WeixinQrWaitResult & {
  status: WeixinLoginSnapshot["status"];
  qrcodeUrl?: string;
  qrImageDataUrl?: string;
  startedAt?: number;
  expiresAt?: number;
  agentToken?: string;
  callbackUrl?: string;
};

function mapLoginStatus(login: Pick<ActiveLogin, "status" | "error">): WeixinLoginSnapshot["status"] {
  if (login.error) {
    return "failed";
  }
  if (login.status === "scaned") {
    return "scanned";
  }
  if (login.status === "confirmed") {
    return "confirmed";
  }
  if (login.status === "expired") {
    return "expired";
  }
  return "waiting";
}

export function getWeixinLoginSnapshot(sessionKey: string): WeixinLoginSnapshot | null {
  purgeExpiredLogins();
  const login = activeLogins.get(sessionKey);
  if (!login) {
    return null;
  }
  return {
    sessionKey: login.sessionKey,
    qrcodeUrl: login.qrcodeUrl,
    startedAt: login.startedAt,
    expiresAt: login.startedAt + ACTIVE_LOGIN_TTL_MS,
    status: mapLoginStatus(login),
    rawStatus: login.status,
    error: login.error,
  };
}

export async function startWeixinLoginWithQr(opts: {
  verbose?: boolean;
  timeoutMs?: number;
  force?: boolean;
  accountId?: string;
  apiBaseUrl: string;
  botType?: string;
  agentToken?: string;
  callbackUrl?: string;
}): Promise<WeixinQrStartResult> {
  const sessionKey = opts.accountId || randomUUID();

  purgeExpiredLogins();

  const existing = activeLogins.get(sessionKey);
  if (
    !opts.force &&
    existing &&
    isLoginFresh(existing) &&
    existing.qrcodeUrl &&
    existing.status !== "expired" &&
    !existing.error
  ) {
    logger.info(`qr-session: reuse ${formatLoginScope(existing)} status=${existing.status ?? "wait"}`);
    return {
      qrcodeUrl: existing.qrcodeUrl,
      message: "二维码已就绪，请使用微信扫描。",
      sessionKey,
    };
  }

  try {
    const botType = opts.botType || DEFAULT_ILINK_BOT_TYPE;
    logger.info(`Starting Weixin login with bot_type=${botType}`);

    if (!opts.apiBaseUrl) {
      return {
        message:
          "No baseUrl configured. Add channels.clawbnb-weixin.baseUrl to your config before logging in.",
        sessionKey,
      };
    }

    const qrResponse = await fetchQRCode(opts.apiBaseUrl, botType);
    logger.info(
      `QR code received, qrcode=${redactToken(qrResponse.qrcode)} imgContentLen=${qrResponse.qrcode_img_content?.length ?? 0}`,
    );
    logger.info(`二维码链接: ${qrResponse.qrcode_img_content}`);

    const login: ActiveLogin = {
      sessionKey,
      id: randomUUID(),
      qrcode: qrResponse.qrcode,
      qrcodeUrl: qrResponse.qrcode_img_content,
      startedAt: Date.now(),
      apiBaseUrl: opts.apiBaseUrl,
      agentToken: opts.agentToken?.trim() || undefined,
      callbackUrl: opts.callbackUrl?.trim() || undefined,
    };

    activeLogins.set(sessionKey, login);
    logger.info(
      `qr-session: created ${formatLoginScope(login)} apiBaseUrl=${opts.apiBaseUrl} botType=${botType}`,
    );

    return {
      qrcodeUrl: qrResponse.qrcode_img_content,
      message: "使用微信扫描以下二维码，以完成连接。",
      sessionKey,
    };
  } catch (err) {
    logger.error(
      `qr-session: create FAILED sessionKey=${redactToken(sessionKey)} accountId=${opts.accountId ?? "(new)"} agentToken=${redactToken(opts.agentToken)} err=${String(err)}`,
    );
    return {
      message: `Failed to start login: ${String(err)}`,
      sessionKey,
    };
  }
}

export async function pollWeixinLoginStatusOnce(opts: {
  sessionKey: string;
  timeoutMs?: number;
}): Promise<WeixinQrStatusResult> {
  purgeExpiredLogins();
  const activeLogin = activeLogins.get(opts.sessionKey);

  if (!activeLogin) {
    return {
      connected: false,
      status: "failed",
      message: "No active QR session found. Create a new QR code and try again.",
    };
  }

  if (!isLoginFresh(activeLogin)) {
    activeLogin.status = "expired";
    logQrStatusTransition(activeLogin, "expired", { reason: "ttl_expired_before_poll" });
    return {
      connected: false,
      status: "expired",
      qrcodeUrl: activeLogin.qrcodeUrl,
      startedAt: activeLogin.startedAt,
      expiresAt: activeLogin.startedAt + ACTIVE_LOGIN_TTL_MS,
      message: "QR code expired. Generate a new one to continue.",
    };
  }

  try {
    const statusResponse = await pollQRStatus(
      activeLogin.apiBaseUrl,
      activeLogin.qrcode,
      opts.timeoutMs ?? QR_DEMO_POLL_TIMEOUT_MS,
    );
    activeLogin.status = statusResponse.status;
    activeLogin.error = undefined;
    logQrStatusTransition(activeLogin, statusResponse.status, {
      hasBotToken: statusResponse.bot_token ? "true" : "false",
      hasBotId: statusResponse.ilink_bot_id ? "true" : "false",
    });

    if (statusResponse.status === "confirmed") {
      activeLogin.botToken = statusResponse.bot_token;
      logger.info(
        `qr-status: confirmed ${formatLoginScope({
          ...activeLogin,
          accountId: statusResponse.ilink_bot_id,
        })} userId=${redactToken(statusResponse.ilink_user_id)} baseUrl=${statusResponse.baseurl ?? "(none)"}`,
      );
      activeLogins.delete(opts.sessionKey);
      return {
        connected: true,
        status: "confirmed",
        qrcodeUrl: activeLogin.qrcodeUrl,
        startedAt: activeLogin.startedAt,
        expiresAt: activeLogin.startedAt + ACTIVE_LOGIN_TTL_MS,
        botToken: statusResponse.bot_token,
        accountId: statusResponse.ilink_bot_id,
        baseUrl: statusResponse.baseurl,
        userId: statusResponse.ilink_user_id,
        message: "Weixin account connected.",
        agentToken: activeLogin.agentToken,
        callbackUrl: activeLogin.callbackUrl,
      };
    }

    return {
      connected: false,
      status: mapLoginStatus(activeLogin),
      qrcodeUrl: activeLogin.qrcodeUrl,
      startedAt: activeLogin.startedAt,
      expiresAt: activeLogin.startedAt + ACTIVE_LOGIN_TTL_MS,
      message:
        statusResponse.status === "scaned"
          ? "QR scanned. Finish the confirmation flow in Weixin."
          : statusResponse.status === "expired"
            ? "QR code expired. Generate a new one to continue."
            : "Waiting for QR scan.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    activeLogin.error = message;
    logger.error(`qr-status: FAILED ${formatLoginScope(activeLogin)} err=${message}`);
    return {
      connected: false,
      status: "failed",
      qrcodeUrl: activeLogin.qrcodeUrl,
      startedAt: activeLogin.startedAt,
      expiresAt: activeLogin.startedAt + ACTIVE_LOGIN_TTL_MS,
      message,
    };
  }
}

const MAX_QR_REFRESH_COUNT = 3;

export async function waitForWeixinLogin(opts: {
  timeoutMs?: number;
  verbose?: boolean;
  sessionKey: string;
  apiBaseUrl: string;
  botType?: string;
}): Promise<WeixinQrWaitResult> {
  let activeLogin = activeLogins.get(opts.sessionKey);

  if (!activeLogin) {
    logger.warn(`waitForWeixinLogin: no active login sessionKey=${opts.sessionKey}`);
    return {
      connected: false,
      message: "当前没有进行中的登录，请先发起登录。",
    };
  }

  if (!isLoginFresh(activeLogin)) {
    logger.warn(`waitForWeixinLogin: login QR expired sessionKey=${opts.sessionKey}`);
    activeLogins.delete(opts.sessionKey);
    return {
      connected: false,
      message: "二维码已过期，请重新生成。",
    };
  }

  const timeoutMs = Math.max(opts.timeoutMs ?? 480_000, 1000);
  const deadline = Date.now() + timeoutMs;
  let scannedPrinted = false;
  let qrRefreshCount = 1;

  logger.info("Starting to poll QR code status...");

  while (Date.now() < deadline) {
    try {
      const statusResponse = await pollQRStatus(opts.apiBaseUrl, activeLogin.qrcode);
      logger.debug(`pollQRStatus: status=${statusResponse.status} hasBotToken=${Boolean(statusResponse.bot_token)} hasBotId=${Boolean(statusResponse.ilink_bot_id)}`);
      activeLogin.status = statusResponse.status;
      logQrStatusTransition(activeLogin, statusResponse.status, {
        hasBotToken: statusResponse.bot_token ? "true" : "false",
        hasBotId: statusResponse.ilink_bot_id ? "true" : "false",
      });

      switch (statusResponse.status) {
        case "wait":
          if (opts.verbose) {
            process.stdout.write(".");
          }
          break;
        case "scaned":
          if (!scannedPrinted) {
            process.stdout.write("\n👀 已扫码，在微信继续操作...\n");
            scannedPrinted = true;
          }
          break;
        case "expired": {
          qrRefreshCount++;
          if (qrRefreshCount > MAX_QR_REFRESH_COUNT) {
            logger.warn(
              `waitForWeixinLogin: QR expired ${MAX_QR_REFRESH_COUNT} times, giving up sessionKey=${opts.sessionKey}`,
            );
            activeLogins.delete(opts.sessionKey);
            return {
              connected: false,
              message: "登录超时：二维码多次过期，请重新开始登录流程。",
            };
          }

          process.stdout.write(`\n⏳ 二维码已过期，正在刷新...(${qrRefreshCount}/${MAX_QR_REFRESH_COUNT})\n`);
          logger.info(
            `waitForWeixinLogin: QR expired, refreshing (${qrRefreshCount}/${MAX_QR_REFRESH_COUNT})`,
          );

          try {
            const botType = opts.botType || DEFAULT_ILINK_BOT_TYPE;
            const qrResponse = await fetchQRCode(opts.apiBaseUrl, botType);
            activeLogin.qrcode = qrResponse.qrcode;
            activeLogin.qrcodeUrl = qrResponse.qrcode_img_content;
            activeLogin.startedAt = Date.now();
            activeLogin.lastObservedStatus = undefined;
            scannedPrinted = false;
            logger.info(`waitForWeixinLogin: new QR code obtained qrcode=${redactToken(qrResponse.qrcode)}`);
            process.stdout.write(`🔄 新二维码已生成，请重新扫描\n\n`);
            try {
              const qrterm = await import("qrcode-terminal");
              qrterm.default.generate(qrResponse.qrcode_img_content, { small: true });
            } catch {
              process.stdout.write(`QR Code URL: ${qrResponse.qrcode_img_content}\n`);
            }
          } catch (refreshErr) {
            logger.error(`waitForWeixinLogin: failed to refresh QR code: ${String(refreshErr)}`);
            activeLogins.delete(opts.sessionKey);
            return {
              connected: false,
              message: `刷新二维码失败: ${String(refreshErr)}`,
            };
          }
          break;
        }
        case "confirmed": {
          if (!statusResponse.ilink_bot_id) {
            activeLogins.delete(opts.sessionKey);
            logger.error("Login confirmed but ilink_bot_id missing from response");
            return {
              connected: false,
              message: "登录失败：服务器未返回 ilink_bot_id。",
            };
          }

          activeLogin.botToken = statusResponse.bot_token;
          activeLogins.delete(opts.sessionKey);

          logger.info(
            `qr-status: confirmed ${formatLoginScope({
              ...activeLogin,
              accountId: statusResponse.ilink_bot_id,
            })} userId=${redactToken(statusResponse.ilink_user_id)} baseUrl=${statusResponse.baseurl ?? "(none)"}`,
          );

          return {
            connected: true,
            botToken: statusResponse.bot_token,
            accountId: statusResponse.ilink_bot_id,
            baseUrl: statusResponse.baseurl,
            userId: statusResponse.ilink_user_id,
            message: "✅ 与微信连接成功！",
          };
        }
      }

    } catch (err) {
      logger.error(`qr-status: FAILED ${formatLoginScope(activeLogin)} err=${String(err)}`);
      activeLogins.delete(opts.sessionKey);
      return {
        connected: false,
        message: `Login failed: ${String(err)}`,
      };
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  logger.warn(
    `waitForWeixinLogin: timed out waiting for QR scan sessionKey=${opts.sessionKey} timeoutMs=${timeoutMs}`,
  );
  activeLogins.delete(opts.sessionKey);
  return {
    connected: false,
    message: "登录超时，请重试。",
  };
}
