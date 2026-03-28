export type OpenClawConfig = Record<string, any>;

export type PluginLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
};

export type PluginRuntime = Record<string, any>;

export type OpenClawPluginServiceContext = {
  logger: PluginLogger;
  config: OpenClawConfig;
  runtime: PluginRuntime;
  resolvePath?: (input: string) => string;
};

export type OpenClawPluginService = {
  id: string;
  start?: (ctx: OpenClawPluginServiceContext) => Promise<void> | void;
  stop?: () => Promise<void> | void;
};

export type ProviderRuntimeModel = Record<string, any>;
export type ProviderPrepareRuntimeAuthContext = Record<string, any>;
export type ProviderNormalizeResolvedModelContext = Record<string, any>;

export type OpenClawPluginApi = {
  runtime: PluginRuntime;
  logger: PluginLogger;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  registrationMode?: string;
  registerChannel(params: any): void;
  registerCli(
    register: (params: { program: any; config: OpenClawConfig }) => void,
    options?: any,
  ): void;
  registerService(service: OpenClawPluginService): void;
  registerProvider(provider: any): void;
  on(name: string, handler: any, options?: any): void;
};

export declare function definePluginEntry<T extends { id: string }>(entry: T): T;
export declare function buildChannelConfigSchema(schema: any): any;
export declare function normalizeAccountId(input: string): string;
