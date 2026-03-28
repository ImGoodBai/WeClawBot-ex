import { describe, expect, it, vi } from "vitest";

import plugin from "../../index.js";

function createApi(params?: { registrationMode?: string; version?: string }) {
  const captured = {
    channels: [] as unknown[],
    providers: [] as unknown[],
    services: [] as Array<{ id: string }>,
    clis: [] as unknown[],
    hooks: [] as string[],
  };
  const api = {
    runtime: {
      version: params?.version ?? "2026.3.24",
      config: { writeConfigFile: vi.fn(async () => {}) },
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    config: {},
    pluginConfig: {},
    registrationMode: params?.registrationMode,
    registerChannel(entry: unknown) {
      captured.channels.push(entry);
    },
    registerProvider(entry: unknown) {
      captured.providers.push(entry);
    },
    registerService(entry: { id: string }) {
      captured.services.push(entry);
    },
    registerCli(entry: unknown) {
      captured.clis.push(entry);
    },
    on(event: string) {
      captured.hooks.push(event);
    },
  };
  return { api, captured };
}

describe("plugin entry registration", () => {
  it("registers the full plugin surface on a supported host", () => {
    const { api, captured } = createApi();

    plugin.register(api);

    expect(captured.channels).toHaveLength(1);
    expect(captured.providers).toHaveLength(1);
    expect(captured.services.map((service) => service.id)).toEqual([
      "clawbnb-hub-demo-service",
      "clawbnb-hub-relay",
    ]);
    expect(captured.clis).toHaveLength(1);
    expect(captured.hooks).toEqual([
      "before_model_resolve",
      "before_prompt_build",
      "before_tool_call",
    ]);
  });

  it("stops after channel registration in setup-only mode", () => {
    const { api, captured } = createApi({ registrationMode: "setup-only" });

    plugin.register(api);

    expect(captured.channels).toHaveLength(1);
    expect(captured.providers).toHaveLength(0);
    expect(captured.services).toHaveLength(0);
    expect(captured.clis).toHaveLength(0);
    expect(captured.hooks).toHaveLength(0);
  });

  it("rejects unsupported host versions before side effects", () => {
    const { api, captured } = createApi({ version: "2026.3.14" });

    expect(() => plugin.register(api)).toThrow(/requires OpenClaw >=2026\.3\.22/);
    expect(captured.channels).toHaveLength(0);
  });
});
