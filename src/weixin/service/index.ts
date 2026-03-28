import type { OpenClawPluginApi, OpenClawPluginService } from "openclaw/plugin-sdk/core";

import { WeixinDemoHttpServer } from "./http-server.js";
import { detectLegacyWeixinPluginConflict, resolveWeixinDemoServiceConfig } from "./config.js";

export function createWeixinDemoService(_api: OpenClawPluginApi): OpenClawPluginService {
  let server: WeixinDemoHttpServer | null = null;

  return {
    id: "clawbnb-hub-demo-service",
    start: async (ctx) => {
      const config = resolveWeixinDemoServiceConfig(ctx.config);
      const conflict = detectLegacyWeixinPluginConflict(ctx.config);
      if (!config.enabled) {
        ctx.logger.info("[ClawBNB Hub] demo service disabled by config");
        return;
      }
      if (conflict.conflict && conflict.message) {
        ctx.logger.warn(`[ClawBNB Hub] ${conflict.message}`);
      }
      server = new WeixinDemoHttpServer({
        logger: ctx.logger,
        config: ctx.config,
      });
      await server.start();
    },
    stop: async () => {
      if (!server) {
        return;
      }
      await server.stop();
      server = null;
    },
  };
}
