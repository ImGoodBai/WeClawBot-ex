export function renderDemoPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ClawBNB Hub Weixin Console</title>
    <style>
      :root {
        --bg: #f4efe5;
        --panel: rgba(255, 250, 242, 0.94);
        --panel-strong: #fffaf1;
        --text: #182019;
        --muted: #627063;
        --line: rgba(24, 32, 25, 0.12);
        --accent: #0f6b43;
        --accent-strong: #0b5133;
        --danger: #b03b35;
        --warn: #9f6b05;
        --ok-bg: rgba(15, 107, 67, 0.11);
        --danger-bg: rgba(176, 59, 53, 0.12);
        --warn-bg: rgba(159, 107, 5, 0.13);
        color-scheme: light;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--text);
        font-family: "PingFang SC", "Noto Serif SC", "Source Han Serif SC", serif;
        background:
          radial-gradient(circle at top left, rgba(15, 107, 67, 0.18), transparent 30%),
          radial-gradient(circle at top right, rgba(159, 107, 5, 0.12), transparent 24%),
          linear-gradient(180deg, #fbf7ef 0%, var(--bg) 100%);
      }
      main {
        max-width: 1160px;
        margin: 0 auto;
        padding: 28px 18px 40px;
      }
      h1, h2, h3, p { margin: 0; }
      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 18px;
        font: inherit;
        cursor: pointer;
        transition: transform 120ms ease, opacity 120ms ease;
      }
      button:hover { transform: translateY(-1px); }
      button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
      .surface {
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: 24px;
        box-shadow: 0 18px 44px rgba(41, 37, 27, 0.07);
      }
      .hero {
        padding: 24px;
      }
      .hero-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: 16px;
      }
      .hero-copy {
        min-width: 0;
        max-width: 720px;
      }
      .hero p {
        margin-top: 10px;
        color: var(--muted);
        line-height: 1.6;
        max-width: 760px;
      }
      .hero-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .hero-links a,
      .hero-links span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 9px 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.66);
        color: var(--text);
        text-decoration: none;
        font-size: 13px;
        overflow-wrap: anywhere;
      }
      .hero-links a:hover {
        background: rgba(255,255,255,0.9);
      }
      .hero-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        justify-self: end;
      }
      .runtime-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .runtime-row select {
        width: 210px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: #fffdf8;
        color: var(--text);
        font: inherit;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 13px;
        background: var(--ok-bg);
        color: var(--accent-strong);
      }
      .badge.warn {
        background: var(--warn-bg);
        color: var(--warn);
      }
      .badge.danger {
        background: var(--danger-bg);
        color: var(--danger);
      }
      .menu {
        position: relative;
      }
      .menu > summary {
        list-style: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.7);
        cursor: pointer;
        user-select: none;
      }
      .menu > summary::-webkit-details-marker { display: none; }
      .menu-panel {
        position: absolute;
        right: 0;
        top: calc(100% + 10px);
        width: 220px;
        padding: 10px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--panel-strong);
        box-shadow: 0 18px 44px rgba(41, 37, 27, 0.12);
        display: grid;
        gap: 8px;
        z-index: 20;
      }
      .menu-panel button {
        text-align: left;
        background: rgba(255,255,255,0.72);
        color: var(--text);
        border: 1px solid var(--line);
      }
      .menu-dot {
        position: absolute;
        top: -2px;
        right: -2px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        background: var(--danger);
        color: #fff;
        font-size: 11px;
        display: none;
        align-items: center;
        justify-content: center;
      }
      .stats {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .stat {
        padding: 18px;
      }
      .stat span {
        color: var(--muted);
        font-size: 13px;
      }
      .stat strong {
        display: block;
        margin-top: 6px;
        font-size: 28px;
      }
      .channels {
        margin-top: 18px;
        padding: 22px;
      }
      .section-head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .section-head p {
        margin-top: 8px;
        color: var(--muted);
        line-height: 1.6;
      }
      .primary {
        background: var(--accent);
        color: #fff;
      }
      .ghost {
        background: rgba(255,255,255,0.74);
        color: var(--text);
        border: 1px solid var(--line);
      }
      .channel-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .channel-card, .empty-card, .diagnostic-card, .log-card {
        padding: 16px;
        border-radius: 20px;
        background: var(--panel-strong);
        border: 1px solid var(--line);
      }
      .channel-card-head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
      }
      .channel-card h3, .diagnostic-card h3 {
        font-size: 18px;
      }
      .channel-meta, .diagnostic-card p, .log-card p {
        margin-top: 8px;
        color: var(--muted);
        line-height: 1.6;
        font-size: 14px;
      }
      .channel-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }
      .link-form {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }
      .link-input {
        flex: 1 1 220px;
        min-width: 0;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.92);
        color: var(--text);
        font: inherit;
      }
      .link-feedback {
        margin-top: 10px;
        color: var(--muted);
        line-height: 1.5;
        font-size: 13px;
      }
      .link-feedback.error {
        color: var(--danger);
      }
      .link-feedback.success {
        color: var(--accent-strong);
      }
      .channel-meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }
      .meta-item {
        padding: 10px 12px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.62);
      }
      .meta-item span {
        display: block;
        color: var(--muted);
        font-size: 12px;
      }
      .meta-item strong {
        display: block;
        margin-top: 4px;
        font-size: 14px;
        line-height: 1.4;
      }
      .channel-note {
        margin-top: 10px;
        color: var(--muted);
        line-height: 1.5;
        font-size: 13px;
      }
      .empty-card {
        min-height: 260px;
        display: grid;
        place-items: center;
        text-align: center;
        grid-column: 1 / -1;
      }
      .empty-card h3 {
        font-size: 26px;
      }
      .empty-card p {
        margin-top: 10px;
        color: var(--muted);
        line-height: 1.7;
        max-width: 420px;
      }
      details.history {
        margin-top: 14px;
        border-top: 1px dashed var(--line);
        padding-top: 12px;
      }
      details.history summary {
        cursor: pointer;
        color: var(--accent-strong);
      }
      .history-list, .diagnostic-list, .log-list {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }
      dialog {
        border: 0;
        padding: 0;
        width: min(92vw, 560px);
        border-radius: 24px;
        background: transparent;
      }
      dialog::backdrop {
        background: rgba(15, 18, 15, 0.4);
        backdrop-filter: blur(6px);
      }
      .modal {
        padding: 22px;
      }
      .modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .close {
        width: 40px;
        height: 40px;
        padding: 0;
        border-radius: 999px;
        background: rgba(255,255,255,0.78);
        border: 1px solid var(--line);
      }
      .status-box, .tip, .command-box {
        margin-top: 14px;
        padding: 14px 16px;
        border-radius: 18px;
      }
      .status-box {
        background: rgba(255,255,255,0.74);
        border: 1px solid var(--line);
      }
      .status-box.waiting { border-color: rgba(15, 107, 67, 0.24); }
      .status-box.scanned { border-color: rgba(159, 107, 5, 0.34); }
      .status-box.confirmed { border-color: rgba(15, 107, 67, 0.4); }
      .status-box.expired, .status-box.failed { border-color: rgba(176, 59, 53, 0.34); }
      .status-box small {
        display: block;
        margin-top: 8px;
        color: var(--muted);
        line-height: 1.5;
      }
      .qr-wrap {
        min-height: 300px;
        margin-top: 14px;
        display: grid;
        place-items: center;
        border-radius: 22px;
        border: 1px dashed var(--line);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.94), rgba(247, 242, 233, 0.96));
      }
      .qr-wrap img {
        width: min(100%, 290px);
        height: auto;
        display: block;
      }
      .tip {
        background: rgba(15, 107, 67, 0.08);
        color: var(--muted);
        line-height: 1.6;
      }
      .tip.warn {
        background: var(--warn-bg);
        color: var(--warn);
      }
      .tip.danger {
        background: var(--danger-bg);
        color: var(--danger);
      }
      .tip strong { color: var(--text); }
      .command-box {
        background: #1a231d;
        color: #f5f0e5;
        font-family: "SFMono-Regular", "Menlo", monospace;
        word-break: break-word;
        white-space: pre-wrap;
      }
      @media (max-width: 900px) {
        .hero-head {
          grid-template-columns: 1fr;
        }
        .stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .hero-actions {
          width: 100%;
          justify-self: stretch;
        }
        .runtime-row {
          flex: 1;
        }
        .runtime-row select {
          width: 100%;
        }
      }
      @media (max-width: 640px) {
        main { padding: 16px 12px 28px; }
        .surface, .channel-card, .empty-card, .diagnostic-card, .log-card, .modal {
          border-radius: 20px;
        }
        .stats {
          grid-template-columns: 1fr;
        }
        .channel-meta-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 850px) {
        .channel-list {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="surface hero">
        <div class="hero-head">
          <div class="hero-copy">
            <h1>ClawBNB Hub 微信控制台</h1>
            <p>将多个微信入口统一接到同一个 OpenClaw Gateway，并集中管理扫码登录、运行状态和独立 Agent 绑定。当前工作区只维护这一套插件实现。</p>
            <div class="hero-links">
              <span>当前工作区：extensions/clawbnb-hub</span>
            </div>
          </div>
          <div class="hero-actions">
            <div class="runtime-row">
              <select id="runtime-select" aria-label="选择后端机器人">
                <option value="openclaw">OpenClaw</option>
                <option value="codex">Codex</option>
                <option value="claude-code">Claude Code</option>
                <option value="coser">Coser</option>
              </select>
              <span id="runtime-status" class="badge">读取中</span>
            </div>
            <details id="menu" class="menu">
              <summary aria-label="更多操作">⋮</summary>
              <span id="menu-dot" class="menu-dot">0</span>
              <div class="menu-panel">
                <button id="menu-diagnostics" type="button">诊断与日志</button>
                <button id="menu-restart" type="button">重启网关</button>
              </div>
            </details>
          </div>
        </div>
        <div id="runtime-warning" class="tip" hidden></div>
      </section>

      <section class="stats">
        <article class="surface stat">
          <span>已接入微信</span>
          <strong id="stat-channels">0</strong>
        </article>
        <article class="surface stat">
          <span>登录记录</span>
          <strong id="stat-records">0</strong>
        </article>
        <article class="surface stat">
          <span>重复登录</span>
          <strong id="stat-duplicates">0</strong>
        </article>
        <article class="surface stat">
          <span>暂停提醒</span>
          <strong id="stat-cooldowns">0</strong>
        </article>
      </section>

      <section class="surface channels">
        <div class="section-head">
          <div>
            <h2>已接入微信</h2>
            <p>每张卡片就是一个已经登录的微信。开启独立绑定后，每个微信会固定对应自己的 Agent。</p>
          </div>
          <button id="add-channel" class="primary" type="button">+ 添加微信</button>
        </div>
        <div id="channel-list" class="channel-list">
          <div class="empty-card">
            <div>
              <h3>扫码登录第一个微信</h3>
              <p>登录完成后，这个机器人就可以同时被多个微信使用。这里会显示每个微信的状态和历史登录。</p>
              <div class="channel-actions" style="justify-content:center;">
                <button id="add-first-channel" class="primary" type="button">立即添加</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <dialog id="channel-modal">
      <article class="surface modal">
        <div class="modal-head">
          <div>
            <h2>添加微信</h2>
            <p class="channel-meta">这一步就是让一个新的微信登录进来，不会长期占着主页面。</p>
          </div>
          <button id="close-channel-modal" class="close" type="button">×</button>
        </div>
        <div id="session-status" class="status-box waiting">
          <strong>当前没有进行中的扫码会话</strong>
          <small>点击“添加微信”后，这里会显示等待扫码、已扫码、已确认或已过期状态。</small>
        </div>
        <div id="qr-wrap" class="qr-wrap">
          <span>正在等待生成二维码</span>
        </div>
        <div id="session-meta" class="tip">
          <strong>提示：</strong> 扫码成功后会优先自动刷新微信通道；若失败，再手动重启网关。
        </div>
      </article>
    </dialog>

    <dialog id="diagnostics-modal">
      <article class="surface modal">
        <div class="modal-head">
          <div>
            <h2>诊断与日志</h2>
            <p class="channel-meta">这里只放次级信息。主页面不再常驻显示风险区块。</p>
          </div>
          <button id="close-diagnostics-modal" class="close" type="button">×</button>
        </div>
        <div class="tip">
          <strong>网关操作：</strong> 这里保留自动刷新状态、兜底重启命令和技术日志，方便排查。
        </div>
        <div id="runtime-env" class="command-box">读取运行环境...</div>
        <div id="restart-command" class="command-box">openclaw gateway restart</div>
        <div id="diagnostic-list" class="diagnostic-list">
          <div class="diagnostic-card">
            <h3>暂无风险项</h3>
            <p>当前没有需要提醒的诊断信息。</p>
          </div>
        </div>
        <details class="history">
          <summary>查看技术日志</summary>
          <div id="log-list" class="log-list">
            <div class="log-card">
              <p>暂无技术日志。</p>
            </div>
          </div>
        </details>
      </article>
    </dialog>

    <script>
      let activeSessionKey = null;
      let pollTimer = null;
      let cachedAccounts = null;
      let cachedErrors = null;
      let cachedHealth = null;
      let restartState = {
        mode: "manual",
        available: false,
        command: "openclaw gateway restart",
        message: "当前环境需要手动重启 Gateway。",
        reason: "",
      };
      const runtimeCatalog = {
        "openclaw": true,
        "codex": false,
        "claude-code": false,
        "coser": false,
      };

      function escapeHtml(input) {
        return String(input)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function cssEscape(input) {
        return String(input).replaceAll("\\\\", "\\\\\\\\").replaceAll('"', '\\"');
      }

      function isLoopbackHostname(hostname) {
        const value = String(hostname || "").trim().toLowerCase();
        return value === "127.0.0.1" || value === "localhost" || value === "::1" || value === "[::1]";
      }

      function resolvePublicProfileUrl(rawUrl) {
        if (!rawUrl) {
          return "";
        }
        try {
          const target = new URL(String(rawUrl), window.location.href);
          if (isLoopbackHostname(target.hostname)) {
            target.hostname = window.location.hostname;
          }
          return target.toString();
        } catch {
          return String(rawUrl);
        }
      }

      function formatTime(value) {
        if (!value) {
          return "-";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return value;
        }
        return date.toLocaleString("zh-CN", { hour12: false });
      }

      function openDialog(id) {
        const dialog = document.getElementById(id);
        if (!dialog.open) {
          dialog.showModal();
        }
      }

      function closeDialog(id) {
        const dialog = document.getElementById(id);
        if (dialog.open) {
          dialog.close();
        }
      }

      function closeMenu() {
        document.getElementById("menu").removeAttribute("open");
      }

      function syncRestartState(next) {
        restartState = {
          mode: next && next.mode ? String(next.mode) : "manual",
          available: Boolean(next && next.available),
          command: next && next.command ? String(next.command) : "openclaw gateway restart",
          message: next && next.message ? String(next.message) : "当前环境需要手动重启 Gateway。",
          reason: next && next.reason ? String(next.reason) : "",
        };
      }

      function buildPostScanTip() {
        if (restartState.mode === "auto" && restartState.available) {
          return "扫码成功后会自动刷新微信通道。等待几秒后，让这个微信先发第一句话。";
        }
        return "扫码成功后，请手动重启网关，并让这个微信先发第一句话。";
      }

      function buildRestartPanelText() {
        const sessionScopeText =
          cachedHealth && cachedHealth.session && cachedHealth.session.dmScope
            ? ("当前会话隔离模式：dmScope=" + String(cachedHealth.session.dmScope))
            : "当前会话隔离模式：未读取到 dmScope";
        const runtimeText =
          cachedHealth && cachedHealth.runtime
            ? (
              "当前状态目录：" + String(cachedHealth.runtime.stateDir || "-") +
              "\\n当前配置文件：" + String(cachedHealth.runtime.configPath || "-")
            )
            : "当前状态目录：未读取到";

        if (restartState.mode === "auto" && restartState.available) {
          return "自动刷新：已启用\\n" +
            restartState.message +
            "\\n兜底命令：" +
            restartState.command +
            "\\n" +
            sessionScopeText +
            "\\n" +
            runtimeText;
        }

        const reasonText = restartState.reason ? ("\\n原因：" + restartState.reason) : "";
        return "自动刷新：不可用\\n" +
          restartState.message +
          reasonText +
          "\\n手动命令：" +
          restartState.command +
          "\\n" +
          sessionScopeText +
          "\\n" +
          runtimeText;
      }

      function buildRuntimePanelText(data) {
        const runtime = data && data.runtime ? data.runtime : {};
        return "stateDir: " + String(runtime.stateDir || "-") + "\\n" +
          "configPath: " + String(runtime.configPath || "-") + "\\n" +
          "stateDirSource: " + String(runtime.stateDirSource || "-") + "\\n" +
          "configPathSource: " + String(runtime.configPathSource || "-") + "\\n" +
          "pid: " + String(runtime.pid || "-");
      }

      function renderRuntimeWarning(data) {
        const el = document.getElementById("runtime-warning");
        const runtime = data && data.runtime ? data.runtime : null;
        document.getElementById("runtime-env").textContent = buildRuntimePanelText(data || {});

        if (!runtime) {
          el.hidden = true;
          el.className = "tip";
          el.innerHTML = "";
          return;
        }

        if (!runtime.stateDirPinned) {
          el.hidden = false;
          el.className = "tip danger";
          el.innerHTML =
            "<strong>危险：</strong> 当前 Gateway 没有固定 OPENCLAW_STATE_DIR，正在使用默认 ~/.openclaw。不同本地联调会互相串状态。";
          return;
        }

        if (!runtime.configPathPinned) {
          el.hidden = false;
          el.className = "tip warn";
          el.innerHTML =
            "<strong>提醒：</strong> 当前已固定 stateDir，但没有固定 OPENCLAW_CONFIG_PATH。建议把配置文件路径也固定到同一套本地环境。";
          return;
        }

        el.hidden = true;
        el.className = "tip";
        el.innerHTML = "";
      }

      function toStatusCopy(status) {
        if (status === "scanned") {
          return {
            title: "已扫码，等待微信端确认",
            detail: "继续在微信里确认授权即可。",
          };
        }
        if (status === "confirmed") {
          return {
            title: "接入成功",
            detail: buildPostScanTip(),
          };
        }
        if (status === "expired") {
          return {
            title: "二维码已过期",
            detail: "重新点击“添加微信”生成新二维码。",
          };
        }
        if (status === "failed") {
          return {
            title: "创建或轮询失败",
            detail: "请检查网络状态，或者重新生成二维码。",
          };
        }
        return {
          title: "等待扫码",
          detail: "使用微信扫描当前二维码开始接入。",
        };
      }

      function setSessionStatus(status, message, detail) {
        const box = document.getElementById("session-status");
        const copy = toStatusCopy(status);
        box.className = "status-box " + status;
        box.innerHTML =
          "<strong>" + escapeHtml(copy.title) + "</strong>" +
          "<small>" + escapeHtml(message || copy.detail || detail || "") + "</small>";
      }

      function renderQr(url, imageDataUrl) {
        const wrap = document.getElementById("qr-wrap");
        if (!url && !imageDataUrl) {
          wrap.innerHTML = "<span>正在等待生成二维码</span>";
          return;
        }
        const src = imageDataUrl || url;
        wrap.innerHTML = '<img alt="Weixin QR code" src="' + escapeHtml(src) + '" />';
      }

      function setSessionMeta(text) {
        document.getElementById("session-meta").innerHTML = "<strong>提示：</strong> " + escapeHtml(text);
      }

      async function readJson(response) {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || ("HTTP " + response.status));
        }
        return response.json();
      }

      function renderHealth(data, diagnosticCount) {
        const dot = document.getElementById("menu-dot");
        dot.textContent = String(diagnosticCount);
        dot.style.display = diagnosticCount > 0 ? "inline-flex" : "none";
        renderRuntimeStatus(data);
        renderRuntimeWarning(data);
      }

      function renderRuntimeStatus(data) {
        const select = document.getElementById("runtime-select");
        const runtimeStatus = document.getElementById("runtime-status");
        const openclawOnline = Boolean(data.gateway && data.gateway.status === "online");

        if (select.value === "openclaw") {
          runtimeStatus.className = openclawOnline ? "badge" : "badge danger";
          runtimeStatus.textContent = openclawOnline
            ? (restartState.mode === "auto" && restartState.available ? "在线 · 自动刷新" : "在线 · 手动刷新")
            : "离线";
          return;
        }

        runtimeStatus.className = "badge warn";
        runtimeStatus.textContent = runtimeCatalog[select.value] ? "在线" : "预留";
      }

      function renderSummary(snapshot) {
        document.getElementById("stat-channels").textContent = String(snapshot.summary.uniqueChannels || 0);
        document.getElementById("stat-records").textContent = String(snapshot.summary.totalStoredRecords || 0);
        document.getElementById("stat-duplicates").textContent = String(snapshot.summary.duplicateChannelCount || 0);
        document.getElementById("stat-cooldowns").textContent = String(snapshot.summary.cooldownChannelCount || 0);
      }

      function renderChannels(snapshot) {
        const el = document.getElementById("channel-list");
        if (!Array.isArray(snapshot.channels) || snapshot.channels.length === 0) {
          el.innerHTML = '<div class="empty-card"><div><h3>扫码登录第一个微信</h3><p>登录完成后，这个机器人就可以同时被多个微信使用。这里会显示每个微信的状态和历史登录。</p><div class="channel-actions" style="justify-content:center;"><button id="add-first-channel-inline" class="primary" type="button">立即添加</button></div></div></div>';
          document.getElementById("add-first-channel-inline").addEventListener("click", () => {
            void createQr();
          });
          return;
        }
        el.innerHTML = snapshot.channels.map((channel, index) => {
          const badgeClass = channel.cooldownActive ? "badge danger" : "badge";
          const badgeText = channel.cooldownActive
            ? ("暂时受限 · " + channel.cooldownRemainingMinutes + " 分钟")
            : "正常";
          const bindingLabel = channel.bindingMode === "dedicated"
            ? "独立 Agent"
            : "共享 Agent";
          const history = channel.records.map((record, recordIndex) => {
            const stateBadge = record.cooldownActive
              ? '<span class="badge danger">暂时受限 · ' + escapeHtml(record.cooldownRemainingMinutes) + ' 分钟</span>'
              : '<span class="badge">正常</span>';
            return '<article class="log-card">' +
              '<strong>登录 ' + escapeHtml(recordIndex + 1) + '</strong>' +
              '<p>最近登录：' + escapeHtml(formatTime(record.savedAt)) + '<br/>微信标识：' + escapeHtml(record.userLabel) + '<br/>内部记录：' + escapeHtml(record.accountShortId) + '</p>' +
              stateBadge +
            '</article>';
          }).join("");
          const publicProfileAction = channel.publicProfileUrl
            ? ('<a class="ghost" href="' + escapeHtml(resolvePublicProfileUrl(channel.publicProfileUrl)) + '" target="_blank" rel="noreferrer">' +
                '打开 Agent 主页' +
              '</a>')
            : "";
          const bindAgentForm = !channel.publicProfileUrl
            ? ('<form class="link-form" data-link-form="' + escapeHtml(channel.primaryAccountId) + '">' +
                '<input class="link-input" type="text" name="agentToken" placeholder="可选：输入 Agent claim token" autocomplete="off" />' +
                '<button class="ghost" type="submit">关联主页</button>' +
              '</form>' +
              '<p class="link-feedback" data-link-feedback="' + escapeHtml(channel.primaryAccountId) + '">可选集成：本地联调时可手动关联 claim token，生成公开页入口。</p>')
            : "";
          return '<article class="channel-card">' +
            '<div class="channel-card-head">' +
              '<div>' +
                '<h3>微信 ' + escapeHtml(index + 1) + '</h3>' +
                '<p class="channel-meta">当前登录：' + escapeHtml(channel.identityLabel) + '</p>' +
              '</div>' +
              '<span class="' + badgeClass + '">' + escapeHtml(badgeText) + '</span>' +
            '</div>' +
            '<div class="channel-meta-grid">' +
              '<div class="meta-item"><span>最近登录</span><strong>' + escapeHtml(formatTime(channel.latestSavedAt)) + '</strong></div>' +
              '<div class="meta-item"><span>历史登录</span><strong>' + escapeHtml(channel.linkedAccountCount) + ' 条</strong></div>' +
              '<div class="meta-item"><span>当前 Agent</span><strong>' + escapeHtml(channel.agentId) + '</strong></div>' +
              '<div class="meta-item"><span>路由模式</span><strong>' + escapeHtml(bindingLabel) + '</strong></div>' +
            '</div>' +
            '<p class="channel-note">' +
              escapeHtml(channel.bindingFallback && channel.bindingReason
                ? ("当前仍在使用共享 Agent：" + channel.bindingReason + "。")
                : channel.bindingMode === "dedicated"
                  ? "这个微信当前已固定绑定到独立 Agent。"
                  : (channel.duplicateRecordCount > 0
                    ? ("这个微信之前重复登录过 " + channel.duplicateRecordCount + " 次，旧记录已经自动收起。")
                    : "这个微信当前只有一条登录记录。")) +
            '</p>' +
            '<div class="channel-actions">' +
              publicProfileAction +
              '<button class="ghost" data-relogin="' + escapeHtml(channel.primaryAccountId) + '">重新扫码</button>' +
            '</div>' +
            bindAgentForm +
            '<details class="history"><summary>查看历史登录</summary><div class="history-list">' + history + '</div></details>' +
          '</article>';
        }).join("");
        el.querySelectorAll("[data-relogin]").forEach((button) => {
          button.addEventListener("click", () => {
            void createQr(button.getAttribute("data-relogin"));
          });
        });
        el.querySelectorAll("[data-link-form]").forEach((form) => {
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const accountId = form.getAttribute("data-link-form") || "";
            const input = form.querySelector('input[name="agentToken"]');
            const submit = form.querySelector('button[type="submit"]');
            const feedback = document.querySelector('[data-link-feedback="' + cssEscape(accountId) + '"]');
            const agentToken = input && typeof input.value === "string" ? input.value.trim() : "";

            if (!agentToken) {
              if (feedback) {
                feedback.className = "link-feedback error";
                feedback.textContent = "请输入 Agent claim token。";
              }
              return;
            }

            if (submit) {
              submit.disabled = true;
            }
            if (feedback) {
              feedback.className = "link-feedback";
              feedback.textContent = "正在关联 Agent 主页...";
            }

            try {
              const data = await readJson(await fetch("/api/accounts/link-agent", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ accountId, agentToken }),
              }));
              if (!data || data.ok === false) {
                throw new Error(data && data.error ? data.error : "关联失败");
              }
              if (feedback) {
                feedback.className = "link-feedback success";
                feedback.textContent = "关联成功，正在刷新主页链接...";
              }
              await refreshDashboard();
            } catch (error) {
              if (feedback) {
                feedback.className = "link-feedback error";
                feedback.textContent = error.message || String(error);
              }
            } finally {
              if (submit) {
                submit.disabled = false;
              }
            }
          });
        });
      }

      function renderDiagnostics(snapshot, errorData) {
        const diagnosticEl = document.getElementById("diagnostic-list");
        const logEl = document.getElementById("log-list");
        const diagnostics = Array.isArray(snapshot.diagnostics) ? snapshot.diagnostics : [];
        const rawErrors = Array.isArray(errorData.errors) ? errorData.errors : [];

        if (diagnostics.length === 0) {
          diagnosticEl.innerHTML = '<article class="diagnostic-card"><h3>暂无风险项</h3><p>当前没有需要提醒的诊断信息。</p></article>';
        } else {
          diagnosticEl.innerHTML = diagnostics.map((item) => {
            const badgeClass =
              item.severity === "danger" ? "badge danger" :
              item.severity === "warn" ? "badge warn" :
              "badge";
            const badgeText =
              item.severity === "danger" ? "需要处理" :
              item.severity === "warn" ? "建议关注" :
              "已自动收拢";
            return '<article class="diagnostic-card">' +
              '<div class="channel-card-head">' +
                '<h3>' + escapeHtml(item.title) + '</h3>' +
                '<span class="' + badgeClass + '">' + escapeHtml(badgeText) + '</span>' +
              '</div>' +
              '<p>' + escapeHtml(item.message) + '</p>' +
            '</article>';
          }).join("");
        }

        if (rawErrors.length === 0) {
          logEl.innerHTML = '<article class="log-card"><p>暂无技术日志。</p></article>';
        } else {
          logEl.innerHTML = rawErrors.map((entry) => {
            const badgeClass = entry.level === "ERROR" ? "badge danger" : "badge warn";
            return '<article class="log-card">' +
              '<div class="channel-card-head">' +
                '<strong>' + escapeHtml(entry.level) + '</strong>' +
                '<span class="' + badgeClass + '">' + escapeHtml(formatTime(entry.time)) + '</span>' +
              '</div>' +
              '<p>' + escapeHtml(entry.message) + '</p>' +
            '</article>';
          }).join("");
        }
      }

      async function createQr(accountId) {
        const payload = accountId ? { accountId } : {};
        const data = await readJson(await fetch("/api/qr/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }));
        if (!data || data.ok === false || !data.sessionKey || !data.qrcodeUrl) {
          throw new Error(data && data.error ? data.error : (data && data.message ? data.message : "二维码创建失败"));
        }
        activeSessionKey = data.sessionKey || null;
        if (cachedHealth && cachedHealth.restart) {
          syncRestartState(cachedHealth.restart);
        }
        renderQr(data.qrcodeUrl, data.qrImageDataUrl);
        setSessionStatus(data.status || "waiting", data.message, data.sessionKey);
        setSessionMeta(
          activeSessionKey
            ? ("当前扫码会话：" + activeSessionKey + "。 " + buildPostScanTip())
            : "当前没有进行中的扫码会话。",
        );
        openDialog("channel-modal");
        if (activeSessionKey) {
          startPolling();
        }
      }

      async function pollStatus() {
        if (!activeSessionKey) {
          return;
        }
        try {
          const data = await readJson(await fetch("/api/qr/" + encodeURIComponent(activeSessionKey) + "/status"));
          if (data.activation) {
            syncRestartState(data.activation);
          }
          renderQr(data.qrcodeUrl, data.qrImageDataUrl);
          setSessionStatus(data.status, data.message, data.accountId || activeSessionKey);
          if (data.status === "confirmed") {
            stopPolling();
            activeSessionKey = null;
            setSessionMeta(
              data.binding && data.binding.mode === "dedicated" && !data.binding.fallback
                ? ("接入成功。已绑定独立 Agent：" + data.binding.agentId + "。")
                : data.activation && data.activation.mode === "auto" && data.activation.available
                  ? "接入成功。自动刷新请求已发送，等待几秒后让该微信先发第一句话。"
                  : "接入成功，但自动刷新没有生效。请手动重启网关，再让该微信先发第一句话。",
            );
            await refreshDashboard();
            setTimeout(() => closeDialog("channel-modal"), 900);
          } else if (data.status === "expired" || data.status === "failed") {
            stopPolling();
            setSessionMeta("当前扫码会话已结束，可以重新生成二维码。");
            await refreshDashboard();
          }
        } catch (error) {
          stopPolling();
          setSessionStatus("failed", error.message || String(error), "");
          setSessionMeta("二维码创建或轮询失败，请重新生成。");
        }
      }

      function startPolling() {
        stopPolling();
        pollTimer = setInterval(() => { void pollStatus(); }, 2500);
        void pollStatus();
      }

      function stopPolling() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      async function refreshDashboard() {
        const [health, accounts, errors] = await Promise.all([
          readJson(await fetch("/api/health")),
          readJson(await fetch("/api/accounts")),
          readJson(await fetch("/api/errors")),
        ]);
        cachedHealth = health;
        cachedAccounts = accounts;
        cachedErrors = errors;
        syncRestartState(health.restart || {});
        renderSummary(accounts);
        renderHealth(health, Array.isArray(accounts.diagnostics) ? accounts.diagnostics.length : 0);
        renderChannels(accounts);
        renderDiagnostics(accounts, errors);
        document.getElementById("restart-command").textContent = buildRestartPanelText();
      }

      document.getElementById("add-channel").addEventListener("click", () => {
        void createQr();
      });

      document.getElementById("add-first-channel").addEventListener("click", () => {
        void createQr();
      });

      document.getElementById("close-channel-modal").addEventListener("click", () => {
        closeDialog("channel-modal");
      });

      document.getElementById("close-diagnostics-modal").addEventListener("click", () => {
        closeDialog("diagnostics-modal");
      });

      document.getElementById("menu-diagnostics").addEventListener("click", () => {
        closeMenu();
        openDialog("diagnostics-modal");
      });

      document.getElementById("menu-restart").addEventListener("click", async () => {
        closeMenu();
        const data = await readJson(await fetch("/api/gateway/restart", { method: "POST" }));
        syncRestartState(data);
        document.getElementById("restart-command").textContent = buildRestartPanelText();
        openDialog("diagnostics-modal");
      });

      document.getElementById("runtime-select").addEventListener("change", () => {
        renderRuntimeStatus(cachedHealth || {});
      });

      setInterval(() => {
        void refreshDashboard();
      }, 15000);

      void refreshDashboard();
    </script>
  </body>
</html>`;
}
