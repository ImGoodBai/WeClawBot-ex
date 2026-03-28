import fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getWeixinChannelReloadStatus,
  triggerWeixinChannelReload,
} from "../../src/weixin/auth/accounts.js";
import { createTempOpenClawEnv } from "../helpers/temp-env.js";

let env: ReturnType<typeof createTempOpenClawEnv>;

describe("weixin config-triggered reload status", () => {
  beforeEach(() => {
    env = createTempOpenClawEnv();
  });

  afterEach(() => {
    env.cleanup();
  });

  it("reports auto mode without mutating config directly", async () => {
    const status = getWeixinChannelReloadStatus();
    expect(status.mode).toBe("auto");
    expect(status.ok).toBe(true);

    const result = await triggerWeixinChannelReload();
    expect(result.mode).toBe("auto");
    expect(result.ok).toBe(true);
    expect(result.triggered).toBe(false);
  });

  it("falls back to manual mode when config is not valid JSON", async () => {
    fs.writeFileSync(env.configPath, "{invalid", "utf-8");

    const status = getWeixinChannelReloadStatus();
    expect(status.mode).toBe("manual");
    expect(status.ok).toBe(false);

    const result = await triggerWeixinChannelReload();
    expect(result.mode).toBe("manual");
    expect(result.ok).toBe(false);
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain("valid JSON");
  });
});
