import fs from "node:fs";

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

export type WeixinDemoServiceConfig = {
  enabled: boolean;
  bind: string;
  port: number;
  restartCommand: string;
};

export type LegacyWeixinPluginConflict = {
  conflict: boolean;
  legacyPluginEnabled: boolean;
  legacyPluginInstalled: boolean;
  installPath?: string;
  message?: string;
};

const DEFAULT_CONFIG: WeixinDemoServiceConfig = {
  enabled: true,
  bind: "127.0.0.1",
  port: 19120,
  restartCommand: "openclaw gateway restart",
};

export function resolveWeixinDemoServiceConfig(config: OpenClawConfig): WeixinDemoServiceConfig {
  const channels = (config as Record<string, unknown>).channels as Record<string, unknown> | undefined;
  const section = channels?.["clawbnb-weixin"] as Record<string, unknown> | undefined;
  const demoService = section?.demoService as Record<string, unknown> | undefined;

  return {
    enabled: typeof demoService?.enabled === "boolean" ? demoService.enabled : DEFAULT_CONFIG.enabled,
    bind: typeof demoService?.bind === "string" && demoService.bind.trim()
      ? demoService.bind.trim()
      : DEFAULT_CONFIG.bind,
    port:
      typeof demoService?.port === "number" &&
      Number.isInteger(demoService.port) &&
      demoService.port > 0 &&
      demoService.port <= 65535
        ? demoService.port
        : DEFAULT_CONFIG.port,
    restartCommand:
      typeof demoService?.restartCommand === "string" && demoService.restartCommand.trim()
        ? demoService.restartCommand.trim()
        : DEFAULT_CONFIG.restartCommand,
  };
}

export function detectLegacyWeixinPluginConflict(config: OpenClawConfig): LegacyWeixinPluginConflict {
  const root = config as Record<string, unknown>;
  const plugins = root.plugins as Record<string, unknown> | undefined;
  const entries = plugins?.entries as Record<string, Record<string, unknown>> | undefined;
  const installs = plugins?.installs as Record<string, Record<string, unknown>> | undefined;

  const legacyEntry = entries?.["molthuman-oc-plugin"];
  const legacyInstall = installs?.["molthuman-oc-plugin"];
  const installPath =
    typeof legacyInstall?.installPath === "string" && legacyInstall.installPath.trim()
      ? legacyInstall.installPath.trim()
      : undefined;

  const legacyPluginEnabled = legacyEntry?.enabled !== false;
  const legacyPluginInstalled = Boolean(installPath && fs.existsSync(installPath));
  const conflict = legacyPluginEnabled && legacyPluginInstalled;

  return {
    conflict,
    legacyPluginEnabled,
    legacyPluginInstalled,
    installPath,
    message: conflict
      ? "Legacy molthuman-oc-plugin is still enabled in this OpenClaw profile. Uninstall or disable it before using clawbnb-hub in the same profile."
      : undefined,
  };
}
