import { type Options, query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  createRuntimeClient,
  type RuntimeClient,
  type RuntimeSessionContext,
  type RuntimeSessionResumeRequest,
  type RuntimeSessionRunRequest,
  type RuntimeTaskRequest,
} from './runtime.js';

export type AgentQueryFn = (params: { options?: Options; prompt: string }) => AsyncIterable<SDKMessage>;

export type AgentRuntimeOptions = {
  queryFn?: AgentQueryFn;
  sdkOptions?: Omit<Options, 'cwd' | 'env'>;
};

export function createAgentRuntime(options: AgentRuntimeOptions = {}): RuntimeClient {
  return createRuntimeClient('agent-sdk', {
    resumeSession: async (request) => createAgentSession(request, options),
    run: async (request) => {
      const { outputText, raw } = await runAgentTask(request, options);
      return { outputText, raw };
    },
    startSession: async (context) => createAgentSession(context, options),
  });
}

async function createAgentSession(
  request: RuntimeSessionContext | RuntimeSessionResumeRequest,
  options: AgentRuntimeOptions
) {
  let sessionId = 'sessionId' in request ? request.sessionId : undefined;

  return {
    getId: () => sessionId,
    run: async (runRequest: RuntimeSessionRunRequest) => {
      const result = await runAgentTask(
        {
          ...request,
          ...runRequest,
        },
        options,
        sessionId
      );
      sessionId = result.sessionId;
      return {
        outputText: result.outputText,
        raw: result.raw,
      };
    },
  };
}

async function runAgentTask(
  request: RuntimeTaskRequest,
  options: AgentRuntimeOptions,
  sessionId?: string
): Promise<{ outputText: string; raw: SDKMessage[]; sessionId: string | undefined }> {
  const messages: SDKMessage[] = [];
  let outputText = '';
  let currentSessionId = sessionId;

  for await (const message of (options.queryFn ?? query)({
    prompt: request.instructions,
    options: {
      ...options.sdkOptions,
      cwd: request.cwd,
      env: request.env,
      resume: sessionId,
    },
  })) {
    messages.push(message);
    outputText = getLatestOutputText(message, outputText);
    currentSessionId = getLatestSessionId(message, currentSessionId);
  }

  return {
    outputText,
    raw: messages,
    sessionId: currentSessionId,
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

function getLatestSessionId(message: SDKMessage, previousSessionId: string | undefined): string | undefined {
  const candidate = message as {
    session_id?: unknown;
  };
  if (typeof candidate.session_id === 'string') {
    return candidate.session_id;
  }
  return previousSessionId;
}
