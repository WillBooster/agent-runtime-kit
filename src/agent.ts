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

type AgentSessionState = {
  current: string | undefined;
};

export function createAgentRuntime(options: AgentRuntimeOptions = {}): RuntimeClient {
  return createRuntimeClient('agent-sdk', {
    resumeSession: (request) => createAgentSession(request, options),
    run: async (request) => (await runAgentTask(request, options)).response,
    startSession: (context) => createAgentSession(context, options),
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
      const sessionState: AgentSessionState = { current: sessionId };

      try {
        const result = await runAgentTask(
          {
            cwd: request.cwd,
            env: request.env,
            instructions: runRequest.instructions,
          },
          options,
          sessionState
        );
        return result.response;
      } finally {
        sessionId = sessionState.current;
      }
    },
  };
}

async function runAgentTask(
  request: RuntimeTaskRequest,
  options: AgentRuntimeOptions,
  sessionState?: AgentSessionState
): Promise<{ response: { outputText: string; raw: SDKMessage[] }; sessionId: string | undefined }> {
  const messages: SDKMessage[] = [];
  let outputText = '';
  let currentSessionId = sessionState?.current;

  for await (const message of (options.queryFn ?? query)({
    prompt: request.instructions,
    options: {
      ...options.sdkOptions,
      cwd: request.cwd,
      env: request.env,
      resume: currentSessionId,
    },
  })) {
    messages.push(message);
    outputText = getLatestOutputText(message, outputText);
    const nextSessionId = getLatestSessionId(message, currentSessionId);
    if (nextSessionId !== currentSessionId) {
      currentSessionId = nextSessionId;
      if (sessionState) {
        sessionState.current = currentSessionId;
      }
    }
  }

  return {
    response: {
      outputText,
      raw: messages,
    },
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
  if (candidate && typeof candidate.session_id === 'string' && candidate.session_id.trim()) {
    return candidate.session_id;
  }
  return previousSessionId;
}
