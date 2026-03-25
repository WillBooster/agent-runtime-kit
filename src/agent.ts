import { type Options, query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createRuntimeClient, type RuntimeClient, type RuntimeTaskRequest } from './runtime.js';

export type AgentQueryFn = (params: { options?: Options; prompt: string }) => AsyncIterable<SDKMessage>;

export type AgentRuntimeOptions = {
  queryFn?: AgentQueryFn;
  sdkOptions?: Omit<Options, 'cwd' | 'env'>;
};

export function createAgentRuntime(options: AgentRuntimeOptions = {}): RuntimeClient {
  return createRuntimeClient('agent-sdk', async (request) => runAgentTask(request, options));
}

async function runAgentTask(
  request: RuntimeTaskRequest,
  options: AgentRuntimeOptions
): Promise<{ outputText: string; raw: SDKMessage[] }> {
  const messages: SDKMessage[] = [];
  let outputText = '';

  for await (const message of (options.queryFn ?? query)({
    prompt: request.instructions,
    options: {
      ...options.sdkOptions,
      cwd: request.cwd,
      env: request.env,
    },
  })) {
    messages.push(message);
    outputText = getLatestOutputText(message, outputText);
  }

  return {
    outputText,
    raw: messages,
  };
}

function getLatestOutputText(message: SDKMessage, previousOutput: string): string {
  const candidate = message as {
    content?: unknown;
    message?: unknown;
    result?: unknown;
  };
  if (typeof candidate.result === 'string') {
    return candidate.result;
  }
  if (typeof candidate.message === 'string') {
    return candidate.message;
  }
  if (typeof candidate.content === 'string') {
    return candidate.content;
  }
  return previousOutput;
}
