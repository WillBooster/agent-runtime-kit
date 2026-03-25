import { expect, test } from 'bun:test';
import {
  createAgentRuntime,
  createCodexRuntime,
  type RuntimeProvider,
  runRuntimeTask,
  SUPPORTED_RUNTIME_PROVIDERS,
} from '../src/index.js';

for (const provider of SUPPORTED_RUNTIME_PROVIDERS) {
  test(`wraps ${provider} behind one interface`, async () => {
    const runtime = createRuntime(provider);
    const result = await runRuntimeTask(runtime, {
      cwd: process.cwd(),
      instructions: 'hello',
    });

    expect(result.provider).toBe(provider);
    expect(result.outputText).toBe(`${provider}:hello`);
  });
}

function createRuntime(provider: RuntimeProvider) {
  if (provider === 'agent-sdk') {
    return createAgentRuntime({
      queryFn: async function* query() {
        yield { result: 'agent-sdk:hello' } as never;
      },
    });
  }

  return createCodexRuntime({
    client: {
      startThread() {
        return {
          run: async () => ({
            finalResponse: 'codex-sdk:hello',
          }),
        };
      },
    } as never,
  });
}
