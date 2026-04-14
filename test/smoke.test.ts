import { expect, test } from 'bun:test';
import {
  createAgentRuntime,
  createCodexRuntime,
  type RuntimeProvider,
  SUPPORTED_RUNTIME_PROVIDERS,
} from '../src/index.js';

for (const provider of SUPPORTED_RUNTIME_PROVIDERS) {
  test(`wraps ${provider} behind one interface`, async () => {
    const runtime = createRuntime(provider);
    const result = await runtime.run({
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
          runStreamed: async () => ({
            events: (async function* () {
              yield {
                item: {
                  id: 'message-1',
                  text: 'codex-sdk:hello',
                  type: 'agent_message',
                },
                type: 'item.completed',
              };
              yield {
                type: 'turn.completed',
                usage: {
                  cached_input_tokens: 0,
                  input_tokens: 0,
                  output_tokens: 0,
                },
              };
            })(),
          }),
        };
      },
    } as never,
  });
}
