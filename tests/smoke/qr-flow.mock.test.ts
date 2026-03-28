import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invokeHttpHandler } from "../helpers/http.js";
import { createTempOpenClawEnv } from "../helpers/temp-env.js";

const loginQrMocks = vi.hoisted(() => ({
  start: vi.fn(async () => ({
    qrcodeUrl: "https://mock.weixin/qr/session-1",
    message: "QR ready",
    sessionKey: "session-1",
  })),
  snapshot: vi.fn((sessionKey: string) => ({
    sessionKey,
    status: "waiting",
    expiresAt: "2026-03-23T12:00:00.000Z",
  })),
  poll: vi.fn(async () => ({
    connected: true,
    botToken: "token-123",
    accountId: "bot@im.bot",
    baseUrl: "https://ilinkai.weixin.qq.com",
    userId: "wx-user-1",
    agentToken: "agent-token-1",
    callbackUrl: "http://127.0.0.1:3000/api/v1/agents/update-weixin-account",
    status: "confirmed",
    message: "confirmed",
    qrcodeUrl: "https://mock.weixin/qr/session-1",
  })),
}));

vi.mock("../../src/weixin/auth/login-qr.js", () => ({
  DEFAULT_ILINK_BOT_TYPE: "iLinkBot",
  startWeixinLoginWithQr: loginQrMocks.start,
  getWeixinLoginSnapshot: loginQrMocks.snapshot,
  pollWeixinLoginStatusOnce: loginQrMocks.poll,
}));

import { WeixinDemoHttpServer } from "../../src/weixin/service/http-server.js";

let env: ReturnType<typeof createTempOpenClawEnv>;
let server: WeixinDemoHttpServer | null = null;

describe("mock qr flow smoke", () => {
  beforeEach(() => {
    const port = 19120;
    env = createTempOpenClawEnv({
      session: {
        dmScope: "per-account-channel-peer",
      },
      agents: {
        list: [{ id: "main" }],
      },
      channels: {
        "clawbnb-weixin": {
          demoService: {
            enabled: true,
            bind: "127.0.0.1",
            port,
            restartCommand: "openclaw gateway restart",
          },
          agentBinding: {
            enabled: true,
            maxAgents: 20,
          },
        },
      },
    });

    process.env.INTERNAL_API_KEY = "demo-internal-key";
    server = new WeixinDemoHttpServer({
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {},
      } as never,
      config: {
        session: {
          dmScope: "per-account-channel-peer",
        },
        channels: {
          "clawbnb-weixin": {
            demoService: {
              enabled: true,
              bind: "127.0.0.1",
              port,
              restartCommand: "openclaw gateway restart",
            },
            agentBinding: {
              enabled: true,
              maxAgents: 20,
            },
          },
        },
      } as never,
    });

  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    env?.cleanup();
    delete process.env.INTERNAL_API_KEY;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("creates a QR session and persists the account on confirm", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock as never);

    const createResult = await invokeHttpHandler(server as never, {
      method: "POST",
      url: "/api/qr/create",
      body: {
        agentToken: "agent-token-1",
        callbackUrl: "http://127.0.0.1:3000/api/v1/agents/update-weixin-account",
      },
    });

    expect(createResult.statusCode).toBe(200);
    expect(createResult.json.ok).toBe(true);
    expect(createResult.json.sessionKey).toBe("session-1");
    expect(createResult.json.status).toBe("waiting");

    const statusResult = await invokeHttpHandler(server as never, {
      method: "GET",
      url: `/api/qr/${encodeURIComponent("session-1")}/status`,
    });

    expect(statusResult.statusCode).toBe(200);
    expect(statusResult.json.connected).toBe(true);
    expect(statusResult.json.status).toBe("confirmed");
    expect(statusResult.json.binding.mode).toBe("dedicated");
    expect(statusResult.json.binding.fallback).toBe(false);
    expect(statusResult.json.activation.mode).toBe("auto");
    expect(statusResult.json.activation.triggered).toBe(true);
    expect(statusResult.json.platformSync.ok).toBe(true);

    const normalizedAccountId = "bot-im-bot";
    const accountPath = path.join(
      env.stateDir,
      "clawbnb-weixin",
      "accounts",
      `${normalizedAccountId}.json`,
    );
    const indexPath = path.join(env.stateDir, "clawbnb-weixin", "accounts.json");
    const config = JSON.parse(fs.readFileSync(env.configPath, "utf-8")) as {
      agents?: { list?: Array<{ id?: string }> };
      bindings?: Array<{ match?: { channel?: string; accountId?: string }; agentId?: string }>;
      channels?: {
        "clawbnb-weixin"?: {
          demoService?: { reloadNonce?: string };
        };
      };
    };
    const mapPath = path.join(env.stateDir, "clawbnb-weixin", "user-agent-map.json");
    const agentId = statusResult.json.binding.agentId as string;

    expect(fs.existsSync(accountPath)).toBe(true);
    expect(fs.existsSync(mapPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(indexPath, "utf-8"))).toContain(normalizedAccountId);
    expect(config.agents?.list?.some((item) => item.id === agentId)).toBe(true);
    expect(
      config.bindings?.some(
        (item) =>
          item.match?.channel === "clawbnb-weixin" &&
          item.match?.accountId === normalizedAccountId &&
          item.agentId === agentId,
      ),
    ).toBe(true);
    expect(config.channels?.["clawbnb-weixin"]?.demoService?.reloadNonce).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/v1/agents/update-weixin-account",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-internal-key": "demo-internal-key",
        }),
      }),
    );
  });

  it("finalizes a QR session in the background even when the page stops polling", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock as never);

    const createResult = await invokeHttpHandler(server as never, {
      method: "POST",
      url: "/api/qr/create",
      body: {
        agentToken: "agent-token-1",
        callbackUrl: "http://127.0.0.1:3000/api/v1/agents/update-weixin-account",
      },
    });

    expect(createResult.statusCode).toBe(200);
    expect(createResult.json.sessionKey).toBe("session-1");

    await vi.advanceTimersByTimeAsync(2_600);

    const normalizedAccountId = "bot-im-bot";
    const accountPath = path.join(
      env.stateDir,
      "clawbnb-weixin",
      "accounts",
      `${normalizedAccountId}.json`,
    );

    expect(fs.existsSync(accountPath)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/v1/agents/update-weixin-account",
      expect.objectContaining({
        method: "POST",
      }),
    );

  });

  it("defaults QR create to reuse current session unless force is requested", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock as never);

    await invokeHttpHandler(server as never, {
      method: "POST",
      url: "/api/qr/create",
      body: {
        accountId: "bot-im-bot",
        agentToken: "agent-token-1",
      },
    });

    expect(loginQrMocks.start).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: "bot-im-bot",
        force: false,
      }),
    );

    await invokeHttpHandler(server as never, {
      method: "POST",
      url: "/api/qr/create",
      body: {
        accountId: "bot-im-bot",
        agentToken: "agent-token-1",
        force: true,
      },
    });

    expect(loginQrMocks.start).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: "bot-im-bot",
        force: true,
      }),
    );
  });
});
