import os from "node:os";
import path from "node:path";

export function resolvePreferredOpenClawTmpDir() {
  return path.join(os.tmpdir(), "openclaw");
}

