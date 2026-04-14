export const SUPPORTED_RUNTIME_PROVIDERS = ['codex-sdk', 'agent-sdk'] as const;

export type RuntimeProvider = (typeof SUPPORTED_RUNTIME_PROVIDERS)[number];

export type RuntimeSessionContext = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type RuntimeTaskRequest = RuntimeSessionContext & {
  instructions: string;
};

export type RuntimeTaskResult<TRaw = unknown, TLog = unknown> = {
  outputText: string;
  provider: RuntimeProvider;
  raw?: TRaw;
  logs?: TLog[];
};

type RuntimeTaskResultWithoutProvider<TRaw, TLog> = Omit<RuntimeTaskResult<TRaw, TLog>, 'provider'>;

export type RuntimeSessionRunRequest = Pick<RuntimeTaskRequest, 'instructions'>;

export type RuntimeSessionResumeRequest = RuntimeSessionContext & {
  sessionId: string;
};

export type RuntimeSession<
  TRunOptions = never,
  TResult extends RuntimeTaskResult = RuntimeTaskResult,
  TLog = unknown,
> = {
  readonly id: string | undefined;
  readonly provider: RuntimeProvider;
  close: () => Promise<void>;
  run: (request: RuntimeSessionRunRequest, options?: TRunOptions) => Promise<TResult>;
  runStream?: (request: RuntimeSessionRunRequest, options?: TRunOptions) => AsyncIterable<TLog>;
};

export type RuntimeClient<
  TRunOptions = never,
  TResult extends RuntimeTaskResult = RuntimeTaskResult,
  TLog = unknown,
> = {
  provider: RuntimeProvider;
  run: (request: RuntimeTaskRequest, options?: TRunOptions) => Promise<TResult>;
  runStream?: (request: RuntimeTaskRequest, options?: TRunOptions) => AsyncIterable<TLog>;
  startSession: (context: RuntimeSessionContext) => Promise<RuntimeSession<TRunOptions, TResult, TLog>>;
  resumeSession: (request: RuntimeSessionResumeRequest) => Promise<RuntimeSession<TRunOptions, TResult, TLog>>;
};

type RuntimeSessionExecutor<TRunOptions, TRaw, TLog> = {
  close?: () => Promise<void> | void;
  getId: () => string | undefined;
  run: (
    request: RuntimeSessionRunRequest,
    options?: TRunOptions
  ) => Promise<RuntimeTaskResultWithoutProvider<TRaw, TLog>>;
  runStream: (request: RuntimeSessionRunRequest, options?: TRunOptions) => AsyncIterable<TLog>;
};

export function createRuntimeClient<TRunOptions = never, TRaw = unknown, TLog = unknown>(
  provider: RuntimeProvider,
  execute: {
    resumeSession: (request: RuntimeSessionResumeRequest) => Promise<RuntimeSessionExecutor<TRunOptions, TRaw, TLog>>;
    run: (request: RuntimeTaskRequest, options?: TRunOptions) => Promise<RuntimeTaskResultWithoutProvider<TRaw, TLog>>;
    runStream: (request: RuntimeTaskRequest, options?: TRunOptions) => AsyncIterable<TLog>;
    startSession: (context: RuntimeSessionContext) => Promise<RuntimeSessionExecutor<TRunOptions, TRaw, TLog>>;
  }
): RuntimeClient<TRunOptions, RuntimeTaskResult<TRaw, TLog>, TLog> {
  return {
    provider,
    run: async (request, options) => withProvider(provider, await execute.run(request, options)),
    runStream: (request, options) => execute.runStream(request, options),
    resumeSession: async (request) => createRuntimeSession(provider, await execute.resumeSession(request)),
    startSession: async (context) => createRuntimeSession(provider, await execute.startSession(context)),
  };
}

function createRuntimeSession<TRunOptions, TRaw, TLog>(
  provider: RuntimeProvider,
  session: RuntimeSessionExecutor<TRunOptions, TRaw, TLog>
): RuntimeSession<TRunOptions, RuntimeTaskResult<TRaw, TLog>, TLog> {
  return {
    get id() {
      return session.getId();
    },
    provider,
    close: async () => {
      await session.close?.();
    },
    run: async (request, options) => withProvider(provider, await session.run(request, options)),
    runStream: (request, options) => session.runStream(request, options),
  };
}

function withProvider<TRaw, TLog>(
  provider: RuntimeProvider,
  response: Omit<RuntimeTaskResult<TRaw, TLog>, 'provider'>
): RuntimeTaskResult<TRaw, TLog> {
  return {
    ...response,
    provider,
  };
}
