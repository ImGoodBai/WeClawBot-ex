import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  pauseSession,
  _resetForTest as resetSessionGuard,
} from "../../src/weixin/api/session-guard.js";
import { buildDemoAccountsSnapshot } from "../../src/weixin/service/state.js";
import { createTempOpenClawEnv } from "../helpers/temp-env.js";

let env: ReturnType<typeof createTempOpenClawEnv>;

function writeAccount(accountId: string, data: Record<string, unknown>): void {
  const accountsDir = path.join(env.stateDir, "clawbnb-weixin", "accounts");
  fs.mkdirSync(accountsDir, { recursive: true });
  fs.writeFileSync(
    path.join(accountsDir, `${accountId}.json`),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf-8",
  );
}

describe("demo account snapshot", () => {
  beforeEach(() => {
    env = createTempOpenClawEnv();
  });

  afterEach(() => {
    resetSessionGuard();
    env.cleanup();
  });

  it("groups duplicate records and emits isolation diagnostics", () => {
    const stateDir = path.join(env.stateDir, "clawbnb-weixin");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, "accounts.json"),
      JSON.stringify(["wx-user-a-1", "wx-user-a-2", "wx-user-b-1"], null, 2),
      "utf-8",
    );

    writeAccount("wx-user-a-1", {
      token: "token-a-1",
      userId: "user-a",
      savedAt: "2026-03-23T09:00:00.000Z",
    });
    writeAccount("wx-user-a-2", {
      token: "token-a-2",
      userId: "user-a",
      savedAt: "2026-03-23T10:00:00.000Z",
    });
    writeAccount("wx-user-b-1", {
      token: "token-b-1",
      savedAt: "2026-03-23T08:00:00.000Z",
    });
    fs.writeFileSync(
      path.join(stateDir, "user-agent-map.json"),
      JSON.stringify({
        version: 1,
        users: {
          "user-a": {
            userId: "user-a",
            agentId: "wx-user-a",
            activeAccountId: "wx-user-a-2",
            historyAccountIds: ["wx-user-a-1", "wx-user-a-2"],
            createdAt: "2026-03-23T09:00:00.000Z",
            updatedAt: "2026-03-23T10:00:00.000Z",
          },
        },
      }, null, 2),
      "utf-8",
    );

    pauseSession("wx-user-a-2");

    const snapshot = buildDemoAccountsSnapshot({
      session: { dmScope: "main" },
      channels: {
        "clawbnb-weixin": {
          agentBinding: {
            enabled: true,
            maxAgents: 20,
          },
        },
      },
    } as never);

    expect(snapshot.summary.totalStoredRecords).toBe(3);
    expect(snapshot.summary.uniqueChannels).toBe(2);
    expect(snapshot.summary.duplicateChannelCount).toBe(1);
    expect(snapshot.summary.cooldownChannelCount).toBe(1);
    expect(snapshot.summary.dedicatedAgentCount).toBe(1);
    expect(snapshot.channels[0]?.linkedAccountCount).toBe(2);
    expect(snapshot.channels[0]?.cooldownRecordCount).toBe(1);
    expect(snapshot.channels[0]?.agentId).toBe("wx-user-a");
    expect(snapshot.channels[0]?.bindingMode).toBe("dedicated");
    expect(snapshot.channels[1]?.bindingMode).toBe("shared");
    expect(snapshot.diagnostics.some((item) => item.kind === "session-scope")).toBe(true);
    expect(snapshot.diagnostics.some((item) => item.kind === "duplicate")).toBe(true);
    expect(snapshot.diagnostics.some((item) => item.kind === "cooldown")).toBe(true);
    expect(snapshot.diagnostics.some((item) => item.kind === "missing-user-id")).toBe(true);
  });

  it("emits a diagnostic when the legacy plugin is still enabled in the same profile", () => {
    const legacyInstallPath = path.join(env.stateDir, "extensions", "molthuman-oc-plugin");
    fs.mkdirSync(legacyInstallPath, { recursive: true });

    const snapshot = buildDemoAccountsSnapshot({
      channels: {
        "clawbnb-weixin": {
          agentBinding: {
            enabled: true,
            maxAgents: 20,
          },
        },
      },
      plugins: {
        entries: {
          "molthuman-oc-plugin": {
            enabled: true,
          },
        },
        installs: {
          "molthuman-oc-plugin": {
            installPath: legacyInstallPath,
          },
        },
      },
    } as never);

    expect(snapshot.diagnostics.some((item) => item.kind === "plugin-conflict")).toBe(true);
  });

  it("exposes pinned runtime paths from env-backed state", () => {
    const snapshot = buildDemoAccountsSnapshot({
      channels: {
        "clawbnb-weixin": {
          agentBinding: {
            enabled: true,
            maxAgents: 20,
          },
        },
      },
    } as never);

    expect(snapshot.runtime.stateDir).toBe(env.stateDir);
    expect(snapshot.runtime.configPath).toBe(env.configPath);
    expect(snapshot.runtime.stateDirPinned).toBe(true);
    expect(snapshot.runtime.configPathPinned).toBe(true);
    expect(snapshot.diagnostics.some((item) => item.kind === "runtime-state")).toBe(false);
  });
});
