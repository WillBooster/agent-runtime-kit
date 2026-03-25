import { createRuntimeClient, type RuntimeClient, type RuntimeTaskRequest, type RuntimeTaskResult } from './runtime.js';

export type AgentSdkRequest = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  metadata?: Record<string, string | undefined>;
  task: string;
};

export type AgentSdkResponse = {
  exitCode: number;
  outputText: string;
  raw?: unknown;
};

export function createAgentRuntime(execute: (request: AgentSdkRequest) => Promise<AgentSdkResponse>): RuntimeClient {
  return createRuntimeClient({
    execute,
    mapRequest: createAgentRequest,
    mapResponse: createAgentResult,
    provider: 'agent-sdk',
  });
}

function createAgentRequest(request: RuntimeTaskRequest): AgentSdkRequest {
  return {
    cwd: request.cwd,
    env: request.env,
    metadata: request.metadata,
    task: request.instructions,
  };
}

function createAgentResult(response: AgentSdkResponse): RuntimeTaskResult {
  return {
    exitCode: response.exitCode,
    outputText: response.outputText,
    provider: 'agent-sdk',
    raw: response.raw,
  };
}
