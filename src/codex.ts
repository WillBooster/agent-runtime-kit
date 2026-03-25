import { Codex, type CodexOptions, type RunResult, type ThreadOptions } from '@openai/codex-sdk';
import { createRuntimeClient, type RuntimeClient, type RuntimeTaskRequest } from './runtime.js';

export type CodexRuntimeOptions = {
  client?: Codex;
  clientOptions?: CodexOptions;
  threadOptions?: Omit<ThreadOptions, 'workingDirectory'>;
};

export function createCodexRuntime(options: CodexRuntimeOptions = {}): RuntimeClient {
  return createRuntimeClient('codex-sdk', async (request) => runCodexTask(request, options));
}

async function runCodexTask(
  request: RuntimeTaskRequest,
  options: CodexRuntimeOptions
): Promise<{ outputText: string; raw: RunResult }> {
  const client = options.client ?? new Codex(createCodexOptions(request, options.clientOptions));
  const thread = client.startThread({
    ...options.threadOptions,
    workingDirectory: request.cwd,
  });
  const result = await thread.run(request.instructions);
  return {
    outputText: result.finalResponse,
    raw: result,
  };
}

function createCodexOptions(request: RuntimeTaskRequest, options: CodexOptions | undefined): CodexOptions | undefined {
  if (!request.env) {
    return options;
  }

  return {
    ...options,
    env: normalizeEnv(request.env),
  };
}

function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}
