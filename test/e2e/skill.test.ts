import { expect, test } from 'bun:test';
import { createAgentRuntime, createCodexRuntime, type RuntimeClient } from '../../src/index.js';

const E2E_TIMEOUT = 1000 * 60 * 20;
const ISSUE_URL = 'https://github.com/exKAZUu/agent-benchmark/issues/1';
const runtimeTest = process.env.CI ? test.skip : test;

for (const provider of ['agent-sdk', 'codex-sdk'] as const) {
  runtimeTest(
    `can use the fetch-issue skill against a GitHub issue with ${provider}`,
    async () => {
      const runtime = createRuntime(provider);
      const cwd = process.cwd();

      const issueResult = await runtime.run({
        cwd,
        instructions: `Use the fetch-issue skill for ${ISSUE_URL}.
Do not use any git write operation and do not modify files.
Return only JSON with this exact shape:
{"title":string,"firstCommentAuthor":string,"mentionsWinnerPr":boolean}
Use the exact issue title.
Set firstCommentAuthor to the login of the first issue comment author.
Set mentionsWinnerPr to true only if the first issue comment mentions pull request 324.`,
      });
      expect(parseJsonObject(issueResult.outputText)).toEqual({
        firstCommentAuthor: 'exKAZUu',
        mentionsWinnerPr: true,
        title: 'fix: print "Hello, World!" instead of "Hello via Bun!"',
      });
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

function parseJsonObject(outputText: string): Record<string, unknown> {
  const trimmed = outputText.trim();
  const candidate =
    extractJsonBlock(trimmed) ??
    trimmed.match(/\{[\s\S]*\}/u)?.[0] ??
    (() => {
      throw new Error(`Expected JSON object, received: ${JSON.stringify(outputText)}`);
    })();

  return JSON.parse(candidate) as Record<string, unknown>;
}

function extractJsonBlock(text: string): string | undefined {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
  return fencedMatch?.[1];
}
