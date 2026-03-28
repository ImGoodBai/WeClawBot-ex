import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageItemType } from "../../src/weixin/api/types.js";
import { uploadBufferToCdn } from "../../src/weixin/cdn/cdn-upload.js";
import { downloadMediaFromItem } from "../../src/weixin/media/media-download.js";

describe("weixin CDN full URL compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses upload_full_url when the server returns a full upload target", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      headers: new Headers({
        "x-encrypted-param": "encrypted-download-param",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock as never);

    const result = await uploadBufferToCdn({
      buf: Buffer.from("hello"),
      uploadFullUrl: "https://cdn.weixin.qq.com/full-upload",
      filekey: "filekey-1",
      cdnBaseUrl: "https://legacy-cdn.weixin.qq.com",
      label: "upload-full-url-test",
      aeskey: Buffer.alloc(16, 1),
    });

    expect(result.downloadParam).toBe("encrypted-download-param");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.weixin.qq.com/full-upload",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("uses full_url when inbound image media omits encrypt_query_param", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "",
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    }));
    vi.stubGlobal("fetch", fetchMock as never);

    const saveMedia = vi.fn(async () => ({ path: "/tmp/inbound-image.bin" }));
    const result = await downloadMediaFromItem(
      {
        type: MessageItemType.IMAGE,
        image_item: {
          media: {
            full_url: "https://cdn.weixin.qq.com/full-download",
          },
        },
      },
      {
        cdnBaseUrl: "https://legacy-cdn.weixin.qq.com",
        saveMedia,
        log() {},
        errLog() {},
        label: "full-url-image",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith("https://cdn.weixin.qq.com/full-download");
    expect(result.decryptedPicPath).toBe("/tmp/inbound-image.bin");
  });
});
