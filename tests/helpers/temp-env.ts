import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

type TempOpenClawEnv = {
  rootDir: string;
  stateDir: string;
  configPath: string;
  restore(): void;
  cleanup(): void;
};

const DEFAULT_CONFIG = {
  session: {
    dmScope: "per-account-channel-peer",
  },
  channels: {
    "clawbnb-weixin": {
      baseUrl: "https://ilinkai.weixin.qq.com",
      agentBinding: {
        enabled: true,
        maxAgents: 20,
      },
      demoService: {
        enabled: true,
        bind: "127.0.0.1",
        port: 19120,
        restartCommand: "openclaw gateway restart",
      },
    },
  },
};

export function createTempOpenClawEnv(
  config: Record<string, unknown> = DEFAULT_CONFIG as Record<string, unknown>,
): TempOpenClawEnv {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawbnb-hub-test-"));
  const stateDir = path.join(rootDir, "state");
  const configPath = path.join(rootDir, "openclaw.json");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  const previous = {
    OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR,
    OPENCLAW_CONFIG_PATH: process.env.OPENCLAW_CONFIG_PATH,
  };

  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.OPENCLAW_CONFIG_PATH = configPath;

  return {
    rootDir,
    stateDir,
    configPath,
    restore() {
      if (previous.OPENCLAW_STATE_DIR === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previous.OPENCLAW_STATE_DIR;
      }
      if (previous.OPENCLAW_CONFIG_PATH === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = previous.OPENCLAW_CONFIG_PATH;
      }
    },
    cleanup() {
      this.restore();
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

export async function findFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to resolve an ephemeral port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}
