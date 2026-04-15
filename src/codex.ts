import {
  Codex,
  type CodexOptions,
  type RunResult,
  type RunStreamedResult,
  type Thread,
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

export interface CodexRuntimeOptions {
  client?: Codex;
  clientOptions?: CodexOptions;
  threadOptions?: Omit<ThreadOptions, 'workingDirectory'>;
}

export interface CodexRunOptions {
  eventFilter?: (event: ThreadEvent) => boolean;
  includeLogs?: boolean;
  turnOptions?: TurnOptions;
}

export type CodexTaskResult = RuntimeTaskResult<RunResult, ThreadEvent>;

export type CodexRuntimeSession = RuntimeSession<CodexRunOptions, CodexTaskResult, ThreadEvent>;

export type CodexRuntimeClient = RuntimeClient<CodexRunOptions, CodexTaskResult, ThreadEvent>;

interface CodexSessionExecutor {
  getId: () => string | undefined;
  run: (request: RuntimeSessionRunRequest, options?: CodexRunOptions) => Promise<Omit<CodexTaskResult, 'provider'>>;
  runStream: (request: RuntimeSessionRunRequest, options?: CodexRunOptions) => AsyncIterable<ThreadEvent>;
}

export function createCodexRuntime(options: CodexRuntimeOptions = {}): CodexRuntimeClient {
  return createRuntimeClient('codex-sdk', {
    resumeSession: (request) => createCodexSession(request, options),
    run: (request, runOptions) => runCodexTask(request, options, runOptions),
    runStream: (request, runOptions) => streamCodexTask(request, options, runOptions),
    startSession: (context) => createCodexSession(context, options),
  });
}

async function runCodexTask(
  request: RuntimeTaskRequest,
  options: CodexRuntimeOptions,
  runOptions?: CodexRunOptions
): Promise<Omit<CodexTaskResult, 'provider'>> {
  const thread = createCodexThread(request, options);
  return collectCodexRunResult(thread.runStreamed(request.instructions, runOptions?.turnOptions), runOptions);
}

async function createCodexSession(
  request: RuntimeSessionContext | RuntimeSessionResumeRequest,
  options: CodexRuntimeOptions
): Promise<CodexSessionExecutor> {
  const thread = createCodexThread(request, options);

  return {
    getId: () => getValidSessionId(thread.id) ?? ('sessionId' in request ? request.sessionId : undefined),
    run: (runRequest: RuntimeSessionRunRequest, runOptions?: CodexRunOptions) =>
      collectCodexRunResult(thread.runStreamed(runRequest.instructions, runOptions?.turnOptions), runOptions),
    runStream: (runRequest: RuntimeSessionRunRequest, runOptions?: CodexRunOptions) =>
      streamCodexEvents(thread.runStreamed(runRequest.instructions, runOptions?.turnOptions), runOptions),
  };
}

async function collectCodexRunResult(
  streamedResultPromise: Promise<RunStreamedResult>,
  options: CodexRunOptions | undefined
): Promise<Omit<CodexTaskResult, 'provider'>> {
  const streamedResult = await streamedResultPromise;
  const logs: ThreadEvent[] | undefined = options?.includeLogs ? [] : undefined;
  const items: RunResult['items'] = [];
  let outputText = '';
  let turnFailure: { message: string } | undefined;
  // Codex SDK represents missing usage as null in RunResult.
  // oxlint-disable-next-line eslint-plugin-unicorn/no-null
  let usage: RunResult['usage'] = null;

  for await (const event of streamedResult.events) {
    if (logs && shouldEmitCodexEvent(event, options)) {
      logs.push(event);
    }
    const state = applyCodexEvent(items, outputText, usage, event);
    outputText = state.outputText;
    turnFailure = state.turnFailure;
    usage = state.usage;
    if (turnFailure) {
      break;
    }
  }

  const raw: RunResult = {
    finalResponse: outputText,
    items,
    usage,
  };

  if (turnFailure) {
    throw new CodexRunError(turnFailure.message, {
      ...(logs ? { logs } : {}),
      raw,
    });
  }

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
    if (shouldEmitCodexEvent(event, options)) {
      yield event;
    }
  }
}

function shouldEmitCodexEvent(event: ThreadEvent, options: CodexRunOptions | undefined): boolean {
  return event.type === 'turn.failed' || (options?.eventFilter?.(event) ?? true);
}

export class CodexRunError extends Error {
  logs?: ThreadEvent[];
  raw: RunResult;

  constructor(message: string, details: { logs?: ThreadEvent[]; raw: RunResult }) {
    super(message);
    this.name = 'CodexRunError';
    this.logs = details.logs;
    this.raw = details.raw;
  }
}

function applyCodexEvent(
  items: RunResult['items'],
  previousOutputText: string,
  previousUsage: RunResult['usage'],
  event: ThreadEvent
): { outputText: string; turnFailure: { message: string } | undefined; usage: RunResult['usage'] } {
  if (event.type === 'item.completed') {
    items.push(event.item);
    return {
      outputText: event.item.type === 'agent_message' ? event.item.text : previousOutputText,
      turnFailure: undefined,
      usage: previousUsage,
    };
  }

  if (event.type === 'turn.completed') {
    return {
      outputText: previousOutputText,
      turnFailure: undefined,
      usage: event.usage,
    };
  }

  if (event.type === 'turn.failed') {
    return {
      outputText: previousOutputText,
      turnFailure: event.error ?? { message: 'Turn failed' },
      usage: previousUsage,
    };
  }

  return {
    outputText: previousOutputText,
    turnFailure: undefined,
    usage: previousUsage,
  };
}

function createCodexThread(
  request: RuntimeSessionContext | RuntimeSessionResumeRequest,
  options: CodexRuntimeOptions
): Thread {
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

function getValidSessionId(sessionId: string | null | undefined): string | undefined {
  if (typeof sessionId === 'string' && sessionId.trim()) {
    return sessionId;
  }

  return undefined;
}
