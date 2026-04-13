import {
  Codex,
  type CodexOptions,
  type RunResult,
  type RunStreamedResult,
  type ThreadEvent,
  type ThreadOptions,
  type TurnOptions,
} from '@openai/codex-sdk';
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

export type CodexRuntimeOptions = {
  client?: Codex;
  clientOptions?: CodexOptions;
  threadOptions?: Omit<ThreadOptions, 'workingDirectory'>;
};

export type CodexRunOptions = {
  eventFilter?: (event: ThreadEvent) => boolean;
  includeLogs?: boolean;
  turnOptions?: TurnOptions;
};

export type CodexTaskResult = RuntimeTaskResult<RunResult, ThreadEvent>;

export type CodexRuntimeSession = RuntimeSession<CodexRunOptions, CodexTaskResult, ThreadEvent>;

export type CodexRuntimeClient = RuntimeClient<CodexRunOptions, CodexTaskResult, ThreadEvent>;

export function createCodexRuntime(options: CodexRuntimeOptions = {}): CodexRuntimeClient {
  return createRuntimeClient('codex-sdk', {
    resumeSession: (request) => createCodexSession(request, options),
    run: (request, runOptions) => runCodexTask(request, options, runOptions),
    runStream: (request, runOptions) => streamCodexTask(request, options, runOptions),
    startSession: (context) => createCodexSession(context, options),
  });
}

async function runCodexTask(request: RuntimeTaskRequest, options: CodexRuntimeOptions, runOptions?: CodexRunOptions) {
  const thread = createCodexThread(request, options);
  return collectCodexRunResult(thread.runStreamed(request.instructions, runOptions?.turnOptions), runOptions);
}

async function createCodexSession(
  request: RuntimeSessionContext | RuntimeSessionResumeRequest,
  options: CodexRuntimeOptions
) {
  const thread = createCodexThread(request, options);

  return {
    getId: () => getValidSessionId(thread.id) ?? ('sessionId' in request ? request.sessionId : undefined),
    run: (runRequest: RuntimeSessionRunRequest, runOptions?: CodexRunOptions) =>
      collectCodexRunResult(thread.runStreamed(runRequest.instructions, runOptions?.turnOptions), runOptions),
    runStream: (runRequest: RuntimeSessionRunRequest, runOptions?: CodexRunOptions) =>
      streamCodexEvents(thread.runStreamed(runRequest.instructions, runOptions?.turnOptions), runOptions),
  };
}

function createCodexThread(request: RuntimeSessionContext | RuntimeSessionResumeRequest, options: CodexRuntimeOptions) {
  const client = options.client ?? new Codex(createCodexOptions(request.env, options.clientOptions));
  const threadOptions = {
    ...options.threadOptions,
    workingDirectory: request.cwd,
  };

  if ('sessionId' in request) {
    return client.resumeThread(request.sessionId, threadOptions);
  }

  return client.startThread(threadOptions);
}

function createCodexOptions(
  env: NodeJS.ProcessEnv | undefined,
  options: CodexOptions | undefined
): CodexOptions | undefined {
  if (!env) {
    return options;
  }

  return {
    ...options,
    env: normalizeEnv(env),
  };
}

function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function formatRunResult(result: RunResult): { outputText: string; raw: RunResult } {
  return {
    outputText: result.finalResponse,
    raw: result,
  };
}

async function collectCodexRunResult(
  streamedResultPromise: Promise<RunStreamedResult>,
  options: CodexRunOptions | undefined
): Promise<Omit<CodexTaskResult, 'provider'>> {
  const streamedResult = await streamedResultPromise;
  const logs: ThreadEvent[] | undefined = options?.includeLogs ? [] : undefined;
  const itemsById = new Map<string, RunResult['items'][number]>();
  let outputText = '';
  let usage: RunResult['usage'] = null;

  for await (const event of streamedResult.events) {
    if (logs && matchesCodexEventFilter(event, options)) {
      logs.push(event);
    }
    const state = applyCodexEvent(itemsById, outputText, usage, event);
    outputText = state.outputText;
    usage = state.usage;
  }

  const raw: RunResult = {
    finalResponse: outputText,
    items: [...itemsById.values()],
    usage,
  };

  return {
    ...(logs ? { logs } : {}),
    ...formatRunResult(raw),
  };
}

async function* streamCodexTask(
  request: RuntimeTaskRequest,
  options: CodexRuntimeOptions,
  runOptions?: CodexRunOptions
): AsyncIterable<ThreadEvent> {
  const thread = createCodexThread(request, options);
  yield* streamCodexEvents(thread.runStreamed(request.instructions, runOptions?.turnOptions), runOptions);
}

async function* streamCodexEvents(
  streamedResultPromise: Promise<RunStreamedResult>,
  options?: CodexRunOptions
): AsyncIterable<ThreadEvent> {
  const streamedResult = await streamedResultPromise;
  for await (const event of streamedResult.events) {
    if (matchesCodexEventFilter(event, options)) {
      yield event;
    }
  }
}

function matchesCodexEventFilter(event: ThreadEvent, options: CodexRunOptions | undefined): boolean {
  return options?.eventFilter?.(event) ?? true;
}

function applyCodexEvent(
  itemsById: Map<string, RunResult['items'][number]>,
  previousOutputText: string,
  previousUsage: RunResult['usage'],
  event: ThreadEvent
): { outputText: string; usage: RunResult['usage'] } {
  if (event.type === 'item.started' || event.type === 'item.updated' || event.type === 'item.completed') {
    itemsById.set(event.item.id, event.item);
    return {
      outputText: event.item.type === 'agent_message' ? event.item.text : previousOutputText,
      usage: previousUsage,
    };
  }

  if (event.type === 'turn.completed') {
    return {
      outputText: previousOutputText,
      usage: event.usage,
    };
  }

  return {
    outputText: previousOutputText,
    usage: previousUsage,
  };
}

function getValidSessionId(sessionId: string | null | undefined): string | undefined {
  if (typeof sessionId === 'string' && sessionId.trim()) {
    return sessionId;
  }

  return undefined;
}
