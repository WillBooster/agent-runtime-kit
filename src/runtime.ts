export const SUPPORTED_RUNTIME_PROVIDERS = ['codex-sdk', 'agent-sdk'] as const;

export type RuntimeProvider = (typeof SUPPORTED_RUNTIME_PROVIDERS)[number];

export type RuntimeTaskRequest = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  instructions: string;
};

export type RuntimeTaskResult = {
  outputText: string;
  provider: RuntimeProvider;
  raw?: unknown;
};

export type RuntimeClient = {
  provider: RuntimeProvider;
  run: (request: RuntimeTaskRequest) => Promise<RuntimeTaskResult>;
};

export function createRuntimeClient(
  provider: RuntimeProvider,
  execute: (request: RuntimeTaskRequest) => Promise<Omit<RuntimeTaskResult, 'provider'>>
): RuntimeClient {
  return {
    provider,
    run: async (request) => {
      const response = await execute(request);
      return {
        ...response,
        provider,
      };
    },
  };
}
