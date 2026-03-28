import { describe, expect, it } from "vitest";
import { createMoltProxyProvider, normalizeMoltProxyModel } from "./provider.js";
import { resolveMoltMarketConfig } from "./config.js";
import { buildOrderTag } from "./contracts.js";

describe("clawbnb-hub provider", () => {
  it("forces proxy baseUrl in normalizeResolvedModel", () => {
    const config = resolveMoltMarketConfig({
      proxyBaseUrl: "https://proxy.example.test/v1",
    });
    const model = normalizeMoltProxyModel(
      {
        id: "market-main",
        name: "market-main",
        provider: "molt-proxy",
        api: "openai-completions",
        baseUrl: "https://old.example.test/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
      config,
    );
    expect(model.baseUrl).toBe("https://proxy.example.test/v1");
  });

  it("uses plugin apiKey during runtime auth preparation", async () => {
    const config = resolveMoltMarketConfig({
      apiKey: "market-key",
      proxyBaseUrl: "https://proxy.example.test/v1",
    });
    const provider = createMoltProxyProvider(config);
    const prepared = await provider.prepareRuntimeAuth?.({
      config: undefined,
      agentDir: undefined,
      workspaceDir: undefined,
      env: process.env,
      provider: "molt-proxy",
      modelId: "market-main",
      model: {
        id: "market-main",
        name: "market-main",
        provider: "molt-proxy",
        api: "openai-completions",
        baseUrl: "https://old.example.test/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
      apiKey: "placeholder",
      authMode: "api_key",
    });
    expect(prepared).toEqual({
      apiKey: "market-key",
      baseUrl: "https://proxy.example.test/v1",
    });
  });

  it("injects rental order header and strips internal order tag before model dispatch", () => {
    const config = resolveMoltMarketConfig({
      proxyBaseUrl: "https://proxy.example.test/v1",
    });
    const provider = createMoltProxyProvider(config);
    let capturedHeaders: Record<string, string> | undefined;
    let payloadAfterPatch: Record<string, unknown> | undefined;
    const wrapped = provider.wrapStreamFn?.({
      config: undefined,
      agentDir: undefined,
      workspaceDir: undefined,
      provider: "molt-proxy",
      modelId: "market-main",
      extraParams: undefined,
      thinkingLevel: undefined,
      streamFn: (_model, _context, options) => {
        capturedHeaders = options?.headers as Record<string, string> | undefined;
        const payload: Record<string, unknown> = {
          messages: [
            {
              role: "system",
              content: `Rental session\n${buildOrderTag("order-123")}\nReply normally.`,
            },
          ],
        };
        options?.onPayload?.(payload, _model);
        payloadAfterPatch = payload;
        return {} as never;
      },
    });

    wrapped?.(
      {
        id: "market-main",
        name: "market-main",
        provider: "molt-proxy",
        api: "openai-completions",
        baseUrl: "https://proxy.example.test/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        messages: [
          {
            role: "system",
            content: `Rental session\n${buildOrderTag("order-123")}\nReply normally.`,
          },
        ],
      } as never,
      {},
    );

    expect(capturedHeaders).toMatchObject({
      "X-Rental-Order-Id": "order-123",
    });
    expect(payloadAfterPatch).toEqual({
      metadata: {
        orderId: "order-123",
      },
      messages: [
        {
          role: "system",
          content: "Rental session\nReply normally.",
        },
      ],
    });
  });

  it("writes metadata.orderId from payload even when runtime context has no order tag", () => {
    const config = resolveMoltMarketConfig({
      proxyBaseUrl: "https://proxy.example.test/v1",
    });
    const provider = createMoltProxyProvider(config);
    let capturedHeaders: Record<string, string> | undefined;
    let payloadAfterPatch: Record<string, unknown> | undefined;
    const wrapped = provider.wrapStreamFn?.({
      config: undefined,
      agentDir: undefined,
      workspaceDir: undefined,
      provider: "molt-proxy",
      modelId: "market-main",
      extraParams: undefined,
      thinkingLevel: undefined,
      streamFn: (_model, _context, options) => {
        capturedHeaders = options?.headers as Record<string, string> | undefined;
        const payload: Record<string, unknown> = {
          messages: [
            {
              role: "system",
              content: `Rental session\n${buildOrderTag("order-456")}\nReply normally.`,
            },
          ],
        };
        options?.onPayload?.(payload, _model);
        payloadAfterPatch = payload;
        return {} as never;
      },
    });

    wrapped?.(
      {
        id: "market-main",
        name: "market-main",
        provider: "molt-proxy",
        api: "openai-completions",
        baseUrl: "https://proxy.example.test/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        messages: [
          {
            role: "user",
            content: "hello",
          },
        ],
      } as never,
      {},
    );

    expect(capturedHeaders).toBeUndefined();
    expect(payloadAfterPatch).toEqual({
      metadata: {
        orderId: "order-456",
      },
      messages: [
        {
          role: "system",
          content: "Rental session\nReply normally.",
        },
      ],
    });
  });

  it("injects rental order header from systemPrompt when the order tag only exists in extra instructions", () => {
    const config = resolveMoltMarketConfig({
      proxyBaseUrl: "https://proxy.example.test/v1",
    });
    const provider = createMoltProxyProvider(config);
    let capturedHeaders: Record<string, string> | undefined;
    let payloadAfterPatch: Record<string, unknown> | undefined;
    const wrapped = provider.wrapStreamFn?.({
      config: undefined,
      agentDir: undefined,
      workspaceDir: undefined,
      provider: "molt-proxy",
      modelId: "market-main",
      extraParams: undefined,
      thinkingLevel: undefined,
      streamFn: (_model, _context, options) => {
        capturedHeaders = options?.headers as Record<string, string> | undefined;
        const payload: Record<string, unknown> = {
          messages: [
            {
              role: "user",
              content: "hello",
            },
          ],
        };
        options?.onPayload?.(payload, _model);
        payloadAfterPatch = payload;
        return {} as never;
      },
    });

    wrapped?.(
      {
        id: "market-main",
        name: "market-main",
        provider: "molt-proxy",
        api: "openai-completions",
        baseUrl: "https://proxy.example.test/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        systemPrompt: `Rental session\n${buildOrderTag("order-789")}\nReply normally.`,
        messages: [
          {
            role: "user",
            content: "hello",
          },
        ],
      } as never,
      {},
    );

    expect(capturedHeaders).toMatchObject({
      "X-Rental-Order-Id": "order-789",
    });
    expect(payloadAfterPatch).toEqual({
      metadata: {
        orderId: "order-789",
      },
      messages: [
        {
          role: "user",
          content: "hello",
        },
      ],
    });
  });
});
