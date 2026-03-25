import { createRuntimeClient, type RuntimeClient, type RuntimeTaskRequest, type RuntimeTaskResult } from './runtime.js';

export type CodexSdkRequest = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  metadata?: Record<string, string | undefined>;
  prompt: string;
};

export type CodexSdkResponse = {
  exitCode: number;
  outputText: string;
  raw?: unknown;
};

export function createCodexRuntime(execute: (request: CodexSdkRequest) => Promise<CodexSdkResponse>): RuntimeClient {
  return createRuntimeClient({
    execute,
    mapRequest: createCodexRequest,
    mapResponse: createCodexResult,
    provider: 'codex-sdk',
  });
}

function createCodexRequest(request: RuntimeTaskRequest): CodexSdkRequest {
  return {
    cwd: request.cwd,
    env: request.env,
    metadata: request.metadata,
    prompt: request.instructions,
  };
}

function createCodexResult(response: CodexSdkResponse): RuntimeTaskResult {
  return {
    exitCode: response.exitCode,
    outputText: response.outputText,
    provider: 'codex-sdk',
    raw: response.raw,
  };
}
