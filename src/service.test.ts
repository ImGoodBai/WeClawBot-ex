import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoltMarketServiceRuntime } from "./service.js";
import { buildOrderTag, buildSessionKey, encodeEnvelope } from "./contracts.js";
import { resolveMoltMarketConfig } from "./config.js";

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("waitFor timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("clawbnb-hub service", () => {
  type SentFrame = { event: string; payload: Record<string, unknown> };

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("registers, heartbeats, streams replies, and cleans up closed sessions", async () => {
    const received: SentFrame[] = [];
    let clientSocket!: EventEmitter;
    let hasClientSocket = false;

    class FakeSocket extends EventEmitter {
      readyState = 1;

      constructor(_url: string) {
        super();
        clientSocket = this;
        hasClientSocket = true;
        setTimeout(() => {
          this.emit("open");
        }, 0);
      }

      send(raw: string) {
        const parsed = JSON.parse(raw) as SentFrame;
        received.push(parsed);
        if (parsed.event === "agent.register") {
          setTimeout(() => {
            this.emit(
              "message",
              encodeEnvelope("agent.register_ack", {
                status: "ok",
                configId: "cfg-1",
              }),
            );
            this.emit(
              "message",
              encodeEnvelope("session.open", {
                orderId: "order-1",
                sessionId: "remote-session-1",
                buyerDisplayName: "Buyer",
                modelTier: "default",
              }),
            );
            this.emit(
              "message",
              encodeEnvelope("session.message", {
                orderId: "order-1",
                sequenceId: 7,
                sender: "buyer",
                content: "hello",
              }),
            );
          }, 0);
        }
      }

      close() {
        this.readyState = 3;
        this.emit("close");
      }
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawbnb-hub-test-"));
    const onAgentEvent = vi.fn<
      (listener: (evt: { runId: string; stream: string; data: Record<string, unknown> }) => void) => () => void
    >((listener) => {
      setTimeout(() => {
        listener({
          runId: "run-1",
          stream: "assistant",
          data: { delta: "hello from proxy" },
        });
      }, 25);
      return () => {};
    });

    const runtime = {
      subagent: {
        run: vi.fn().mockResolvedValue({ runId: "run-1" }),
        waitForRun: vi.fn().mockImplementation(
          async () =>
            await new Promise<{ status: "ok" }>((resolve) => {
              setTimeout(() => resolve({ status: "ok" }), 60);
            }),
        ),
        getSessionMessages: vi.fn().mockResolvedValue({ messages: [] }),
        getSession: vi.fn().mockResolvedValue({ messages: [] }),
        deleteSession: vi.fn().mockResolvedValue(undefined),
      },
      events: {
        onAgentEvent,
      },
    } as const;

    const service = new MoltMarketServiceRuntime({
      runtime: runtime as never,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      config: resolveMoltMarketConfig({
        relayUrl: "ws://relay.example.test",
        apiKey: "market-key",
        proxyModelId: "market-main",
        heartbeatIntervalMs: 50,
        tempRoot,
      }),
      deps: {
        WebSocketCtor: FakeSocket as never,
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            agent: {
              id: "agent-from-key",
            },
          }),
        }) as never,
      },
    });

    await service.start();

    await waitFor(() => received.some((entry) => entry.event === "session.reply_chunk"));
    expect(runtime.subagent.run).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(buildOrderTag("order-1")),
        extraSystemPrompt: expect.stringContaining(buildOrderTag("order-1")),
      }),
    );
    if (!hasClientSocket) {
      throw new Error("client socket not initialized");
    }
    clientSocket.emit(
      "message",
      encodeEnvelope("session.close", {
        orderId: "order-1",
        reason: "buyer_done",
      }),
    );
    await waitFor(() => received.some((entry) => entry.event === "session.close_ack"));
    await waitFor(() => runtime.subagent.deleteSession.mock.calls.length === 1);

    expect(received).toContainEqual({
      event: "agent.register",
      payload: expect.objectContaining({
        agentId: "agent-from-key",
      }),
    });
    expect(received).toContainEqual({
      event: "agent.heartbeat",
      payload: expect.objectContaining({
        agentId: "agent-from-key",
      }),
    });
    expect(received).toContainEqual({
      event: "session.open_ack",
      payload: { orderId: "order-1", status: "accepted" },
    });
    expect(received).toContainEqual({
      event: "session.reply_chunk",
      payload: {
        orderId: "order-1",
        sequenceId: 7,
        content: "hello from proxy",
        isFinal: false,
      },
    });
    expect(received).toContainEqual({
      event: "session.reply_chunk",
      payload: {
        orderId: "order-1",
        sequenceId: 7,
        content: "",
        isFinal: true,
      },
    });
    expect(await fs.stat(tempRoot)).toBeDefined();
    await waitFor(async () => {
      try {
        await fs.stat(path.join(tempRoot, "order-1"));
        return false;
      } catch {
        return true;
      }
    });

    await service.stop();
  });

  it("keeps early assistant deltas that arrive before subagent.run resolves", async () => {
    const received: SentFrame[] = [];

    class FakeSocket extends EventEmitter {
      readyState = 1;

      constructor(_url: string) {
        super();
        setTimeout(() => {
          this.emit("open");
        }, 0);
      }

      send(raw: string) {
        const parsed = JSON.parse(raw) as SentFrame;
        received.push(parsed);
        if (parsed.event === "agent.register") {
          setTimeout(() => {
            this.emit(
              "message",
              encodeEnvelope("agent.register_ack", {
                status: "ok",
                configId: "cfg-1",
              }),
            );
            this.emit(
              "message",
              encodeEnvelope("session.open", {
                orderId: "order-early",
                sessionId: "remote-session-early",
                buyerDisplayName: "Buyer",
                modelTier: "default",
              }),
            );
            this.emit(
              "message",
              encodeEnvelope("session.message", {
                orderId: "order-early",
                sequenceId: 3,
                sender: "buyer",
                content: "hello",
              }),
            );
          }, 0);
        }
      }

      close() {
        this.readyState = 3;
        this.emit("close");
      }
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawbnb-hub-test-"));
    const onAgentEvent = vi.fn<
      (
        listener: (evt: {
          runId: string;
          stream: string;
          data: Record<string, unknown>;
          sessionKey?: string;
        }) => void,
      ) => () => void
    >((listener) => {
      setTimeout(() => {
        listener({
          runId: "run-early",
          sessionKey: buildSessionKey("order-early"),
          stream: "assistant",
          data: { delta: "prefix chunk " },
        });
      }, 0);
      setTimeout(() => {
        listener({
          runId: "run-early",
          sessionKey: buildSessionKey("order-early"),
          stream: "assistant",
          data: { delta: "tail chunk" },
        });
      }, 40);
      return () => {};
    });

    const runtime = {
      subagent: {
        run: vi.fn().mockImplementation(
          async () =>
            await new Promise<{ runId: "run-early" }>((resolve) => {
              setTimeout(() => resolve({ runId: "run-early" }), 20);
            }),
        ),
        waitForRun: vi.fn().mockImplementation(
          async () =>
            await new Promise<{ status: "ok" }>((resolve) => {
              setTimeout(() => resolve({ status: "ok" }), 80);
            }),
        ),
        getSessionMessages: vi.fn().mockResolvedValue({ messages: [] }),
        getSession: vi.fn().mockResolvedValue({ messages: [] }),
        deleteSession: vi.fn().mockResolvedValue(undefined),
      },
      events: {
        onAgentEvent,
      },
    } as const;

    const service = new MoltMarketServiceRuntime({
      runtime: runtime as never,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      config: resolveMoltMarketConfig({
        relayUrl: "ws://relay.example.test",
        apiKey: "market-key",
        proxyModelId: "market-main",
        heartbeatIntervalMs: 50,
        tempRoot,
      }),
      deps: {
        WebSocketCtor: FakeSocket as never,
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            agent: {
              id: "agent-from-key",
            },
          }),
        }) as never,
      },
    });

    await service.start();

    await waitFor(() => {
      const chunks = received.filter((entry) => entry.event === "session.reply_chunk");
      return chunks.some(
        (entry) =>
          entry.payload.orderId === "order-early" &&
          entry.payload.sequenceId === 3 &&
          entry.payload.content === "" &&
          entry.payload.isFinal === true,
      );
    });

    expect(received).toContainEqual({
      event: "session.reply_chunk",
      payload: {
        orderId: "order-early",
        sequenceId: 3,
        content: "prefix chunk ",
        isFinal: false,
      },
    });
    expect(received).toContainEqual({
      event: "session.reply_chunk",
      payload: {
        orderId: "order-early",
        sequenceId: 3,
        content: "tail chunk",
        isFinal: false,
      },
    });
    expect(received).toContainEqual({
      event: "session.reply_chunk",
      payload: {
        orderId: "order-early",
        sequenceId: 3,
        content: "",
        isFinal: true,
      },
    });

    await service.stop();
  });
});
