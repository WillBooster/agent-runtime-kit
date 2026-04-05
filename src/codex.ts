import { Codex, type CodexOptions, type RunResult, type ThreadOptions } from '@openai/codex-sdk';
import {
  createRuntimeClient,
  type RuntimeClient,
  type RuntimeSessionContext,
  type RuntimeSessionResumeRequest,
  type RuntimeTaskRequest,
} from './runtime.js';

export type CodexRuntimeOptions = {
  client?: Codex;
  clientOptions?: CodexOptions;
  threadOptions?: Omit<ThreadOptions, 'workingDirectory'>;
};

export function createCodexRuntime(options: CodexRuntimeOptions = {}): RuntimeClient {
  return createRuntimeClient('codex-sdk', {
    resumeSession: async (request) => createCodexSession(request, options),
    run: async (request) => runCodexTask(request, options),
    startSession: async (context) => createCodexSession(context, options),
  });
}

async function runCodexTask(
  request: RuntimeTaskRequest,
  options: CodexRuntimeOptions
): Promise<{ outputText: string; raw: RunResult }> {
  const thread = createCodexThread(request, options);
  const result = await thread.run(request.instructions);
  return {
    outputText: result.finalResponse,
    raw: result,
  };
}

async function createCodexSession(
  request: RuntimeSessionContext | RuntimeSessionResumeRequest,
  options: CodexRuntimeOptions
) {
  const thread = createCodexThread(request, options);

  return {
    getId: () => thread.id ?? ('sessionId' in request ? request.sessionId : undefined),
    run: async ({ instructions }: { instructions: string }) => {
      const result = await thread.run(instructions);
      return {
        outputText: result.finalResponse,
        raw: result,
      };
    },
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
