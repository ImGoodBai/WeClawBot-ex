import { describe, expect, it } from "vitest";

import { renderDemoPage } from "../../src/weixin/service/page.js";

describe("demo page render", () => {
  it("renders the main shell and API hooks", () => {
    const page = renderDemoPage();
    expect(page).toContain("ClawBNB Hub 微信控制台");
    expect(page).toContain("/api/qr/create");
    expect(page).toContain("/api/accounts/link-agent");
    expect(page).toContain("/api/health");
    expect(page).toContain("自动刷新");
    expect(page).toContain("添加微信");
    expect(page).toContain("独立 Agent");
    expect(page).toContain("可选：输入 Agent claim token");
    expect(page).toContain("OPENCLAW_STATE_DIR");
    expect(page).toContain("读取运行环境");
  });
});
