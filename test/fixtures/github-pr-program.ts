import { createAgentRuntime, createCodexRuntime, type RuntimeClient } from '../../src/index.js';

const issueUrl = 'https://github.com/exKAZUu/agent-benchmark/issues/1';
const provider = process.env.AGENT_RUNTIME_KIT_PROVIDER ?? 'codex-sdk';

const runtime = createRuntime(provider);
const result = await runtime.run({
  cwd: process.cwd(),
  instructions: buildInstructions(issueUrl),
});

process.stdout.write(result.outputText);

function createRuntime(runtimeProvider: string): RuntimeClient {
  if (runtimeProvider === 'agent-sdk') {
    return createAgentRuntime({
      sdkOptions: {
        allowDangerouslySkipPermissions: true,
        allowedTools: ['Agent', 'Bash', 'Edit', 'Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch', 'Write'],
        maxTurns: 200,
        permissionMode: 'bypassPermissions',
        settingSources: ['project'],
      },
    });
  }

  return createCodexRuntime({
    threadOptions: {
      approvalPolicy: 'never',
      modelReasoningEffort: 'high',
      networkAccessEnabled: true,
      sandboxMode: 'danger-full-access',
      webSearchEnabled: true,
    },
  });
}

function buildInstructions(targetIssueUrl: string): string {
  return [
    `Resolve GitHub issue: ${targetIssueUrl}`,
    'Work in the current repository checkout.',
    'Make the smallest correct change that closes the issue.',
    'Run the project checks needed for confidence before opening the pull request.',
    'Commit the changes, push the branch, and open a pull request linked to the issue.',
    'Print the created pull request URL in the final output.',
  ].join('\n');
}
