import fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempOpenClawEnv } from "../helpers/temp-env.js";
import { resolveOrRegisterWeixinUserAgent } from "../../src/weixin/service/user-agent-binding.js";

let env: ReturnType<typeof createTempOpenClawEnv>;

describe("user-agent binding", () => {
  beforeEach(() => {
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
            port: 19120,
            restartCommand: "openclaw gateway restart",
          },
          agentBinding: {
            enabled: true,
            maxAgents: 20,
          },
        },
      },
    });
  });

  afterEach(() => {
    env.cleanup();
  });

  it("registers agents.list and bindings together for a new user", async () => {
    const result = await resolveOrRegisterWeixinUserAgent({
      userId: "wx-user-a",
      accountId: "bot-a-im-bot",
    });

    expect(result.mode).toBe("dedicated");
    expect(result.fallback).toBe(false);
    expect(result.created).toBe(true);
    expect(result.agentId).toMatch(/^wx-[0-9a-f]{8}$/);

    const updated = JSON.parse(fs.readFileSync(env.configPath, "utf-8")) as {
      agents?: { list?: Array<{ id?: string }> };
      bindings?: Array<{ match?: { channel?: string; accountId?: string }; agentId?: string }>;
    };
    const agentIds = (updated.agents?.list ?? []).map((item) => item.id);
    const binding = (updated.bindings ?? []).find((item) => item.match?.accountId === "bot-a-im-bot");

    expect(agentIds).toContain("main");
    expect(agentIds).toContain(result.agentId);
    expect(binding?.match?.channel).toBe("clawbnb-weixin");
    expect(binding?.agentId).toBe(result.agentId);
    expect((updated as { session?: { dmScope?: string } }).session?.dmScope).toBe(
      "per-account-channel-peer",
    );
  });

  it("keeps the same agent when the same user logs in again", async () => {
    const first = await resolveOrRegisterWeixinUserAgent({
      userId: "wx-user-a",
      accountId: "bot-a-im-bot",
    });
    const second = await resolveOrRegisterWeixinUserAgent({
      userId: "wx-user-a",
      accountId: "bot-a-v2-im-bot",
    });

    expect(second.agentId).toBe(first.agentId);
    expect(second.created).toBe(false);

    const mapPath = `${env.stateDir}/clawbnb-weixin/user-agent-map.json`;
    const map = JSON.parse(fs.readFileSync(mapPath, "utf-8")) as {
      users?: Record<string, { activeAccountId?: string; historyAccountIds?: string[] }>;
    };
    const user = map.users?.["wx-user-a"];
    const updated = JSON.parse(fs.readFileSync(env.configPath, "utf-8")) as {
      bindings?: Array<{ match?: { accountId?: string }; agentId?: string }>;
    };
    const bindings = updated.bindings ?? [];

    expect(user?.activeAccountId).toBe("bot-a-v2-im-bot");
    expect(user?.historyAccountIds).toContain("bot-a-im-bot");
    expect(user?.historyAccountIds).toContain("bot-a-v2-im-bot");
    expect(bindings.some((item) => item.match?.accountId === "bot-a-im-bot")).toBe(false);
    expect(bindings.some((item) => item.match?.accountId === "bot-a-v2-im-bot" && item.agentId === first.agentId)).toBe(true);
  });

  it("preserves both bindings when two users bind concurrently", async () => {
    const [first, second] = await Promise.all([
      resolveOrRegisterWeixinUserAgent({
        userId: "wx-user-a",
        accountId: "bot-a-im-bot",
      }),
      resolveOrRegisterWeixinUserAgent({
        userId: "wx-user-b",
        accountId: "bot-b-im-bot",
      }),
    ]);

    expect(first.mode).toBe("dedicated");
    expect(second.mode).toBe("dedicated");
    expect(first.agentId).not.toBe(second.agentId);

    const updated = JSON.parse(fs.readFileSync(env.configPath, "utf-8")) as {
      agents?: { list?: Array<{ id?: string }> };
      bindings?: Array<{ match?: { channel?: string; accountId?: string }; agentId?: string }>;
      session?: { dmScope?: string };
    };
    const mapPath = `${env.stateDir}/clawbnb-weixin/user-agent-map.json`;
    const map = JSON.parse(fs.readFileSync(mapPath, "utf-8")) as {
      users?: Record<string, { agentId?: string; activeAccountId?: string }>;
    };
    const agentIds = new Set((updated.agents?.list ?? []).map((item) => item.id).filter(Boolean));
    const bindings = updated.bindings ?? [];

    expect(agentIds.has("main")).toBe(true);
    expect(agentIds.has(first.agentId)).toBe(true);
    expect(agentIds.has(second.agentId)).toBe(true);
    expect(
      bindings.some(
        (item) =>
          item.match?.channel === "clawbnb-weixin" &&
          item.match?.accountId === "bot-a-im-bot" &&
          item.agentId === first.agentId,
      ),
    ).toBe(true);
    expect(
      bindings.some(
        (item) =>
          item.match?.channel === "clawbnb-weixin" &&
          item.match?.accountId === "bot-b-im-bot" &&
          item.agentId === second.agentId,
      ),
    ).toBe(true);
    expect(updated.session?.dmScope).toBe("per-account-channel-peer");
    expect(map.users?.["wx-user-a"]?.agentId).toBe(first.agentId);
    expect(map.users?.["wx-user-b"]?.agentId).toBe(second.agentId);
    expect(map.users?.["wx-user-a"]?.activeAccountId).toBe("bot-a-im-bot");
    expect(map.users?.["wx-user-b"]?.activeAccountId).toBe("bot-b-im-bot");
  });

  it("falls back to the shared agent when userId is missing", async () => {
    const result = await resolveOrRegisterWeixinUserAgent({
      accountId: "bot-anon-im-bot",
    });

    expect(result.mode).toBe("shared");
    expect(result.fallback).toBe(true);
    expect(result.agentId).toBe("main");
  });

  it("auto-upgrades dmScope when config starts in main mode", async () => {
    env.cleanup();
    env = createTempOpenClawEnv({
      session: {
        dmScope: "main",
      },
      agents: {
        list: [{ id: "main" }],
      },
      channels: {
        "clawbnb-weixin": {
          demoService: {
            enabled: true,
            bind: "127.0.0.1",
            port: 19120,
            restartCommand: "openclaw gateway restart",
          },
        },
      },
    });

    await resolveOrRegisterWeixinUserAgent({
      userId: "wx-user-b",
      accountId: "bot-b-im-bot",
    });

    const updated = JSON.parse(fs.readFileSync(env.configPath, "utf-8")) as {
      session?: { dmScope?: string };
    };
    expect(updated.session?.dmScope).toBe("per-account-channel-peer");
  });
});
