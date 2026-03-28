import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WeixinDemoHttpServer } from "../../src/weixin/service/http-server.js";
import { invokeHttpHandler } from "../helpers/http.js";
import { createTempOpenClawEnv } from "../helpers/temp-env.js";

let env: ReturnType<typeof createTempOpenClawEnv>;
let server: WeixinDemoHttpServer | null = null;

describe("demo service health smoke", () => {
  beforeEach(() => {
    const port = 19120;
    env = createTempOpenClawEnv({
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
        },
      },
    });

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
  });

  it("serves health and accounts endpoints", async () => {
    const health = await invokeHttpHandler(server as never, {
      method: "GET",
      url: "/api/health",
    });
    const accounts = await invokeHttpHandler(server as never, {
      method: "GET",
      url: "/api/accounts",
    });

    expect(health.statusCode).toBe(200);
    expect(health.json.ok).toBe(true);
    expect(health.json.gateway.status).toBe("online");
    expect(health.json.restart.mode).toBe("auto");
    expect(accounts.statusCode).toBe(200);
    expect(accounts.json.summary.totalStoredRecords).toBe(0);
  });
});
