export const SUPPORTED_RUNTIME_PROVIDERS = ['codex-sdk', 'agent-sdk'] as const;

export type RuntimeProvider = (typeof SUPPORTED_RUNTIME_PROVIDERS)[number];

export type RuntimeSessionContext = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type RuntimeTaskRequest = RuntimeSessionContext & {
  instructions: string;
};

export type RuntimeTaskResult = {
  outputText: string;
  provider: RuntimeProvider;
  raw?: unknown;
};

export type RuntimeSessionRunRequest = Pick<RuntimeTaskRequest, 'instructions'>;

export type RuntimeSessionResumeRequest = RuntimeSessionContext & {
  sessionId: string;
};

export type RuntimeSession = {
  readonly id: string | undefined;
  readonly provider: RuntimeProvider;
  close: () => Promise<void>;
  run: (request: RuntimeSessionRunRequest) => Promise<RuntimeTaskResult>;
};

export type RuntimeClient = {
  provider: RuntimeProvider;
  run: (request: RuntimeTaskRequest) => Promise<RuntimeTaskResult>;
  startSession: (context: RuntimeSessionContext) => Promise<RuntimeSession>;
  resumeSession: (request: RuntimeSessionResumeRequest) => Promise<RuntimeSession>;
};

type RuntimeSessionExecutor = {
  close?: () => Promise<void> | void;
  getId: () => string | undefined;
  run: (request: RuntimeSessionRunRequest) => Promise<Omit<RuntimeTaskResult, 'provider'>>;
};

export function createRuntimeClient(
  provider: RuntimeProvider,
  execute: {
    resumeSession: (request: RuntimeSessionResumeRequest) => Promise<RuntimeSessionExecutor>;
    run: (request: RuntimeTaskRequest) => Promise<Omit<RuntimeTaskResult, 'provider'>>;
    startSession: (context: RuntimeSessionContext) => Promise<RuntimeSessionExecutor>;
  }
): RuntimeClient {
  return {
    provider,
    run: async (request) => {
      const response = await execute.run(request);
      return {
        ...response,
        provider,
      };
    },
    resumeSession: async (request) => createRuntimeSession(provider, await execute.resumeSession(request)),
    startSession: async (context) => createRuntimeSession(provider, await execute.startSession(context)),
  };
}

function createRuntimeSession(provider: RuntimeProvider, session: RuntimeSessionExecutor): RuntimeSession {
  return {
    get id() {
      return session.getId();
    },
    provider,
    close: async () => {
      await session.close?.();
    },
    run: async (request) => {
      const response = await session.run(request);
      return {
        ...response,
        provider,
      };
    },
  };
}
