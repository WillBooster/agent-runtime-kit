export type RuntimeProvider = 'agent-sdk' | 'codex-sdk';

export type RuntimeTaskRequest = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  instructions: string;
  metadata?: Record<string, string | undefined>;
};

export type RuntimeTaskResult = {
  exitCode: number;
  outputText: string;
  provider: RuntimeProvider;
  raw?: unknown;
};

export type RuntimeAdapter<Request, Response> = {
  execute: (request: Request) => Promise<Response>;
  mapRequest: (request: RuntimeTaskRequest) => Request;
  mapResponse: (response: Response) => RuntimeTaskResult;
  provider: RuntimeProvider;
};

export type RuntimeClient = {
  provider: RuntimeProvider;
  run: (request: RuntimeTaskRequest) => Promise<RuntimeTaskResult>;
};

export function createRuntimeClient<Request, Response>(adapter: RuntimeAdapter<Request, Response>): RuntimeClient {
  return {
    provider: adapter.provider,
    run: async (request) => {
      const response = await adapter.execute(adapter.mapRequest(request));
      return adapter.mapResponse(response);
    },
  };
}

export async function runRuntimeTask(runtime: RuntimeClient, request: RuntimeTaskRequest): Promise<RuntimeTaskResult> {
  return runtime.run(request);
}
