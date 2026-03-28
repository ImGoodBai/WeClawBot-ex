import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGetFetch } from "../../src/weixin/api/api.js";

describe("weixin api headers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the upstream baseline for iLink client version headers", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "{}",
    }));
    vi.stubGlobal("fetch", fetchMock as never);

    await apiGetFetch({
      baseUrl: "https://ilinkai.weixin.qq.com",
      endpoint: "ilink/bot/ping",
      timeoutMs: 100,
      label: "header-test",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    expect(headers["iLink-App-Id"]).toBe("bot");
    expect(headers["iLink-App-ClientVersion"]).toBe("131329");
  });
});
