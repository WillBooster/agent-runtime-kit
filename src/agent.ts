import { type Options, query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  createRuntimeClient,
  type RuntimeClient,
  type RuntimeSession,
  type RuntimeSessionContext,
  type RuntimeSessionResumeRequest,
  type RuntimeSessionRunRequest,
  type RuntimeTaskRequest,
  type RuntimeTaskResult,
} from './runtime.js';

export type AgentQueryFn = (params: { options?: Options; prompt: string }) => AsyncIterable<SDKMessage>;

export type AgentRuntimeOptions = {
  queryFn?: AgentQueryFn;
  sdkOptions?: Omit<Options, 'cwd' | 'env'>;
};

export type AgentRunOptions = {
  includeLogs?: boolean;
  logFilter?: (message: SDKMessage) => boolean;
  queryOptions?: Omit<Options, 'cwd' | 'env' | 'resume'>;
};

export type AgentTaskResult = RuntimeTaskResult<SDKMessage[], SDKMessage>;

export type AgentRuntimeSession = RuntimeSession<AgentRunOptions, AgentTaskResult, SDKMessage>;

export type AgentRuntimeClient = RuntimeClient<AgentRunOptions, AgentTaskResult, SDKMessage>;

type AgentSessionState = {
  current: string | undefined;
};

export function createAgentRuntime(options: AgentRuntimeOptions = {}): AgentRuntimeClient {
  return createRuntimeClient('agent-sdk', {
    resumeSession: (request) => createAgentSession(request, options),
    run: (request, runOptions) => runAgentTask(request, options, undefined, runOptions),
    runStream: (request, runOptions) => streamAgentTask(request, options, undefined, runOptions),
    startSession: (context) => createAgentSession(context, options),
  });
}

async function createAgentSession(
  request: RuntimeSessionContext | RuntimeSessionResumeRequest,
  options: AgentRuntimeOptions
) {
  const sessionState: AgentSessionState = {
    current: 'sessionId' in request ? request.sessionId : undefined,
  };

  return {
    getId: () => sessionState.current,
    run: (runRequest: RuntimeSessionRunRequest, runOptions?: AgentRunOptions) =>
      runAgentTask(
        {
          cwd: request.cwd,
          env: request.env,
          instructions: runRequest.instructions,
        },
        options,
        sessionState,
        runOptions
      ),
    runStream: (runRequest: RuntimeSessionRunRequest, runOptions?: AgentRunOptions) =>
      streamAgentTask(
        {
          cwd: request.cwd,
          env: request.env,
          instructions: runRequest.instructions,
        },
        options,
        sessionState,
        runOptions
      ),
  };
}

async function runAgentTask(
  request: RuntimeTaskRequest,
  options: AgentRuntimeOptions,
  sessionState?: AgentSessionState,
  runOptions?: AgentRunOptions
): Promise<Omit<AgentTaskResult, 'provider'>> {
  const messages: SDKMessage[] = [];
  const logs: SDKMessage[] | undefined = runOptions?.includeLogs ? [] : undefined;
  let outputText = '';

  for await (const message of iterateAgentMessages(request, options, sessionState, runOptions)) {
    messages.push(message);
    outputText = getLatestOutputText(message, outputText);
    if (logs && (runOptions?.logFilter?.(message) ?? true)) {
      logs.push(message);
    }
  }

  return {
    ...(logs ? { logs } : {}),
    outputText,
    raw: messages,
  };
}

async function* streamAgentTask(
  request: RuntimeTaskRequest,
  options: AgentRuntimeOptions,
  sessionState?: AgentSessionState,
  runOptions?: AgentRunOptions
): AsyncIterable<SDKMessage> {
  for await (const message of iterateAgentMessages(request, options, sessionState, runOptions)) {
    if (runOptions?.logFilter?.(message) ?? true) {
      yield message;
    }
  }
}

async function* iterateAgentMessages(
  request: RuntimeTaskRequest,
  options: AgentRuntimeOptions,
  sessionState?: AgentSessionState,
  runOptions?: AgentRunOptions
): AsyncIterable<SDKMessage> {
  let currentSessionId = sessionState?.current;

  for await (const message of (options.queryFn ?? query)({
    prompt: request.instructions,
    options: {
      ...options.sdkOptions,
      ...runOptions?.queryOptions,
      cwd: request.cwd,
      env: request.env,
      resume: currentSessionId,
    },
  })) {
    const nextSessionId = getLatestSessionId(message, currentSessionId);
    if (nextSessionId !== currentSessionId) {
      currentSessionId = nextSessionId;
      if (sessionState) {
        sessionState.current = currentSessionId;
      }
    }
    yield message;
  }
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
