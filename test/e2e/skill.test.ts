import { expect, test } from 'bun:test';
import { createAgentRuntime, createCodexRuntime, type RuntimeClient } from '../../src/index.js';

const E2E_TIMEOUT = 1000 * 60 * 20;
const ISSUE_NO = '3';
const runtimeTest = process.env.CI ? test.skip : test;

for (const provider of ['agent-sdk', 'codex-sdk'] as const) {
  runtimeTest(
    `can use the fetch-issue skill against a GitHub issue with ${provider}`,
    async () => {
      const runtime = createRuntime(provider);
      const cwd = process.cwd();
      const skillTrigger = provider === 'codex-sdk' ? '$fetch-issue' : '/fetch-issue';

      const issueResult = await runtime.run({
        cwd,
        instructions: `${skillTrigger} ${ISSUE_NO}`,
      });
      expect(issueResult.outputText).toContain('Dependency Dashboard');
      expect(issueResult.outputText).toContain('#3');
    },
    { timeout: E2E_TIMEOUT }
  );
}

function createRuntime(provider: 'agent-sdk' | 'codex-sdk'): RuntimeClient {
  if (provider === 'agent-sdk') {
    return createAgentRuntime({
      sdkOptions: {
        allowDangerouslySkipPermissions: true,
        allowedTools: ['Bash', 'Read'],
        maxTurns: 100,
        permissionMode: 'bypassPermissions',
        settingSources: ['project'],
      },
    });
  }

  return createCodexRuntime({
    threadOptions: {
      approvalPolicy: 'never',
      modelReasoningEffort: 'low',
      networkAccessEnabled: true,
      sandboxMode: 'danger-full-access',
      webSearchEnabled: false,
    },
  });
}
