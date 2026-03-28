import { logger } from "./util/logger.js";

export const WEIXIN_UPSTREAM_BASELINE = "2.0.1";
export const SUPPORTED_HOST_MIN = "2026.3.22";

type OpenClawVersion = {
  year: number;
  month: number;
  day: number;
};

export function parseOpenClawVersion(version: string): OpenClawVersion | null {
  const base = version.trim().split("-")[0];
  const parts = base.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [year, month, day] = parts.map(Number);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  return { year, month, day };
}

export function compareVersions(a: OpenClawVersion, b: OpenClawVersion): -1 | 0 | 1 {
  for (const key of ["year", "month", "day"] as const) {
    if (a[key] < b[key]) {
      return -1;
    }
    if (a[key] > b[key]) {
      return 1;
    }
  }
  return 0;
}

export function isHostVersionSupported(hostVersion: string): boolean {
  const host = parseOpenClawVersion(hostVersion);
  const min = parseOpenClawVersion(SUPPORTED_HOST_MIN);
  if (!host || !min) {
    return false;
  }
  return compareVersions(host, min) >= 0;
}

export function assertHostCompatibility(hostVersion: string | undefined): void {
  if (!hostVersion || hostVersion === "unknown") {
    logger.warn(
      `[compat] Could not determine host OpenClaw version; skipping compatibility check.`,
    );
    return;
  }
  if (isHostVersionSupported(hostVersion)) {
    logger.info(
      `[compat] Host OpenClaw ${hostVersion} satisfies Weixin upstream baseline ${WEIXIN_UPSTREAM_BASELINE}.`,
    );
    return;
  }
  throw new Error(
    `clawbnb-hub Weixin layer derived from @tencent-weixin/openclaw-weixin@${WEIXIN_UPSTREAM_BASELINE} requires OpenClaw >=${SUPPORTED_HOST_MIN}, but found ${hostVersion}.`,
  );
}
