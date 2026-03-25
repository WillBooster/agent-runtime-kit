import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentRuntime, createCodexRuntime, runRuntimeTask, type RuntimeClient } from '../../src/index.js';
import { runCommand } from '../e2e/utils.js';

const issueUrl = getRequiredEnv('AGENT_RUNTIME_KIT_E2E_ISSUE_URL');
const provider = process.env.AGENT_RUNTIME_KIT_E2E_PROVIDER ?? 'codex-sdk';
const runnerCommandTemplate = getRequiredEnv('AGENT_RUNTIME_KIT_E2E_RUNNER_COMMAND');

const runtime = createRuntime(provider);
const result = await runRuntimeTask(runtime, {
  cwd: process.cwd(),
  env: process.env,
  instructions: buildInstructions(issueUrl),
  metadata: {
    issueUrl,
  },
});

process.stdout.write(result.outputText);
process.exitCode = result.exitCode;

function createRuntime(runtimeProvider: string): RuntimeClient {
  if (runtimeProvider === 'agent-sdk') {
    return createAgentRuntime((request) =>
      runExternalAgent({
        cwd: request.cwd,
        env: request.env,
        instructions: request.task,
        provider: 'agent-sdk',
      })
    );
  }

  return createCodexRuntime((request) =>
    runExternalAgent({
      cwd: request.cwd,
      env: request.env,
      instructions: request.prompt,
      provider: 'codex-sdk',
    })
  );
}

async function runExternalAgent(config: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  instructions: string;
  provider: string;
}): Promise<{ exitCode: number; outputText: string; raw?: unknown }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-kit-program-'));
  const instructionsPath = path.join(tempDir, 'instructions.md');

  try {
    await writeFile(instructionsPath, config.instructions, 'utf8');
    const command = interpolateCommand(runnerCommandTemplate, {
      cwd: config.cwd,
      instructionsPath,
      issueUrl,
      provider: config.provider,
    });
    const result = await runCommand(['zsh', '-lc', command], {
      cwd: config.cwd,
      env: {
        ...process.env,
        ...config.env,
        AGENT_RUNTIME_KIT_INSTRUCTIONS: config.instructions,
        AGENT_RUNTIME_KIT_INSTRUCTIONS_PATH: instructionsPath,
        AGENT_RUNTIME_KIT_PROVIDER: config.provider,
      },
      streamOutput: true,
      throwOnError: false,
    });
    return {
      exitCode: result.exitCode,
      outputText: result.combined,
      raw: result,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
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

function interpolateCommand(
  template: string,
  values: Record<'cwd' | 'instructionsPath' | 'issueUrl' | 'provider', string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, shellEscape(value));
  }
  return result;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
