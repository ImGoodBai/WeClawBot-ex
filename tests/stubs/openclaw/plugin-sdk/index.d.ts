export type OpenClawConfig = Record<string, any>;

export type ReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
};

export type ChannelAccountSnapshot = Record<string, any>;

export type PluginRuntime = Record<string, any>;

export type ChannelPlugin<T = any> = Record<string, any> & {
  id: string;
  config: any;
};

export { buildChannelConfigSchema, normalizeAccountId } from "./core.js";

export declare function createTypingCallbacks(...args: unknown[]): {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  keepalive: () => Promise<void>;
};

export declare function resolveDirectDmAuthorizationOutcome(...args: unknown[]): string;

export declare function resolveSenderCommandAuthorizationWithRuntime(...args: unknown[]): Promise<{
  senderAllowedForCommands: boolean;
  commandAuthorized: boolean;
}>;

export declare function stripMarkdown(text: string): string;
