import { describe, expect, it } from "vitest";

import { renderQrImageDataUrl } from "../../src/weixin/service/qr-image.js";

describe("qr image rendering", () => {
  it("falls back to SVG when media runtime returns a stub PNG", async () => {
    const dataUrl = await renderQrImageDataUrl("https://example.com/weixin-qr");

    expect(dataUrl).toBeDefined();
    expect(dataUrl).toContain("data:image/svg+xml");
    expect(dataUrl).not.toContain("data:image/png;base64,c3R1Yi1wbmc=");
  });
});
