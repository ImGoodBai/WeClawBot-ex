export { buildChannelConfigSchema, normalizeAccountId } from "./core.js";

export function createTypingCallbacks() {
  return {
    start: async () => {},
    stop: async () => {},
    keepalive: async () => {},
  };
}

export function resolveDirectDmAuthorizationOutcome() {
  return "allowed";
}

export async function resolveSenderCommandAuthorizationWithRuntime() {
  return {
    senderAllowedForCommands: true,
    commandAuthorized: true,
  };
}

export function stripMarkdown(text) {
  return String(text ?? "");
}
