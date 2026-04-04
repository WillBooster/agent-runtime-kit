import { expect, test } from 'bun:test';
import { createAgentRuntime, createCodexRuntime } from '../../src/index.js';

const E2E_TIMEOUT = 1000 * 60 * 20;
const runtimeTest = process.env.CI ? test.skip : test;

runtimeTest(
  'supports interactive conversation across Codex and Claude sessions',
  async () => {
    const cwd = process.cwd();
    const codexRuntime = createCodexRuntime({
      threadOptions: {
        approvalPolicy: 'never',
        modelReasoningEffort: 'medium',
        networkAccessEnabled: true,
        sandboxMode: 'danger-full-access',
      },
    });
    const claudeRuntime = createAgentRuntime({
      sdkOptions: {
        allowDangerouslySkipPermissions: true,
        allowedTools: ['Read'],
        permissionMode: 'bypassPermissions',
        settingSources: ['project'],
      },
    });

    const codexSession = await codexRuntime.startSession({ cwd, env: process.env });
    const claudeSession = await claudeRuntime.startSession({ cwd, env: process.env });

    try {
      const codexValue = await askForRandomNumber(codexSession, 'Codex');
      expect(codexSession.id).toBeTruthy();

      const claudeValue = await askForRandomNumber(claudeSession, 'Claude');
      expect(claudeSession.id).toBeTruthy();

      const expectedSum = codexValue + claudeValue;

      const codexSum = await askForSum(codexSession, claudeValue, 'Codex');
      expect(codexSum).toBe(expectedSum);

      const claudeSum = await askForSum(claudeSession, codexValue, 'Claude');
      expect(claudeSum).toBe(expectedSum);
    } finally {
      await codexSession.close();
      await claudeSession.close();
    }
  },
  { timeout: E2E_TIMEOUT }
);

async function askForRandomNumber(
  session: { run: (request: { instructions: string }) => Promise<{ outputText: string }> },
  providerName: string
): Promise<number> {
  const result = await session.run({
    instructions: [
      'Print only one random integer between 100 and 999.',
      'Do not include any words, punctuation, explanation, markdown, or code fences.',
      'Your full response must be digits only.',
    ].join(' '),
  });
  return parseInteger(result.outputText, `${providerName} random number`);
}

async function askForSum(
  session: { run: (request: { instructions: string }) => Promise<{ outputText: string }> },
  otherValue: number,
  providerName: string
): Promise<number> {
  const result = await session.run({
    instructions: [
      `Print only the summation of your previous printed integer and ${otherValue}.`,
      'Do not include any words, punctuation, explanation, markdown, or code fences.',
      'Your full response must be digits only.',
    ].join(' '),
  });
  return parseInteger(result.outputText, `${providerName} summation`);
}

function parseInteger(outputText: string, label: string): number {
  const trimmed = outputText.trim();
  if (!/^\d+$/u.test(trimmed)) {
    throw new Error(`Expected ${label} to be digits only, received: ${JSON.stringify(outputText)}`);
  }
  return Number.parseInt(trimmed, 10);
}
