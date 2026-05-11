import { afterEach, describe, expect, it, vi } from "vitest";

const apiGetFetchMock = vi.hoisted(() => vi.fn());
const apiPostFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/weixin/api/api.js", () => ({
  apiGetFetch: apiGetFetchMock,
  apiPostFetch: apiPostFetchMock,
}));

import {
  pollWeixinLoginStatusOnce,
  startWeixinLoginWithQr,
} from "../../src/weixin/auth/login-qr.js";

describe("weixin login qr compatibility", () => {
  afterEach(() => {
    apiGetFetchMock.mockReset();
    apiPostFetchMock.mockReset();
  });

  it("switches polling host after scaned_but_redirect", async () => {
    apiPostFetchMock.mockResolvedValueOnce(
      JSON.stringify({
        qrcode: "qr-1",
        qrcode_img_content: "https://mock.weixin/qr-1",
      }),
    );
    apiGetFetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          status: "scaned_but_redirect",
          redirect_host: "redirect.weixin.qq.com",
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          status: "confirmed",
          bot_token: "bot-token",
          ilink_bot_id: "bot@im.bot",
          ilink_user_id: "user@im.wechat",
          baseurl: "https://redirect.weixin.qq.com",
        }),
      );

    const started = await startWeixinLoginWithQr({
      accountId: "acct-redirect",
      apiBaseUrl: "https://unused.example",
    });
    expect(started.sessionKey).toBe("acct-redirect");

    const redirectResult = await pollWeixinLoginStatusOnce({
      sessionKey: "acct-redirect",
    });
    expect(redirectResult.connected).toBe(false);
    expect(redirectResult.status).toBe("waiting");

    const confirmedResult = await pollWeixinLoginStatusOnce({
      sessionKey: "acct-redirect",
    });
    expect(confirmedResult.connected).toBe(true);
    expect(confirmedResult.status).toBe("confirmed");

    expect(apiPostFetchMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        baseUrl: "https://ilinkai.weixin.qq.com",
      }),
    );
    expect(apiGetFetchMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        baseUrl: "https://ilinkai.weixin.qq.com",
      }),
    );
    expect(apiGetFetchMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        baseUrl: "https://redirect.weixin.qq.com",
      }),
    );
  });

  it("surfaces non-retryable poll errors instead of masking them as wait", async () => {
    apiPostFetchMock.mockResolvedValueOnce(
      JSON.stringify({
        qrcode: "qr-2",
        qrcode_img_content: "https://mock.weixin/qr-2",
      }),
    );
    apiGetFetchMock.mockRejectedValueOnce(new Error("pollQRStatus 400: bad request"));

    const started = await startWeixinLoginWithQr({
      accountId: "acct-fail",
      apiBaseUrl: "https://unused.example",
    });
    expect(started.sessionKey).toBe("acct-fail");

    const result = await pollWeixinLoginStatusOnce({
      sessionKey: "acct-fail",
    });

    expect(result.connected).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.message).toContain("400");
  });

  it("treats binded_redirect as an already-connected success state", async () => {
    apiPostFetchMock.mockResolvedValueOnce(
      JSON.stringify({
        qrcode: "qr-3",
        qrcode_img_content: "https://mock.weixin/qr-3",
      }),
    );
    apiGetFetchMock.mockResolvedValueOnce(
      JSON.stringify({
        status: "binded_redirect",
      }),
    );

    const started = await startWeixinLoginWithQr({
      accountId: "acct-binded",
      apiBaseUrl: "https://unused.example",
    });
    expect(started.sessionKey).toBe("acct-binded");

    const result = await pollWeixinLoginStatusOnce({
      sessionKey: "acct-binded",
    });

    expect(result.connected).toBe(false);
    expect(result.alreadyConnected).toBe(true);
    expect(result.status).toBe("confirmed");
  });
});
