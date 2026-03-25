import { expect, test } from 'bun:test';
import { createAgentRuntime, createCodexRuntime, runRuntimeTask } from '../src/index.js';

test('wraps codex and agent runtimes behind one interface', async () => {
  const codexRuntime = createCodexRuntime(async (request) => ({
    exitCode: 0,
    outputText: `codex:${request.prompt}`,
  }));
  const agentRuntime = createAgentRuntime(async (request) => ({
    exitCode: 0,
    outputText: `agent:${request.task}`,
  }));

  const codexResult = await runRuntimeTask(codexRuntime, {
    cwd: process.cwd(),
    instructions: 'hello',
  });
  const agentResult = await runRuntimeTask(agentRuntime, {
    cwd: process.cwd(),
    instructions: 'world',
  });

  expect(codexResult.provider).toBe('codex-sdk');
  expect(codexResult.outputText).toBe('codex:hello');
  expect(agentResult.provider).toBe('agent-sdk');
  expect(agentResult.outputText).toBe('agent:world');
});
