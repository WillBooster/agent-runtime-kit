import { expect, test } from 'bun:test';
import path from 'node:path';
import {
  assertCleanWorkingTree,
  createTemporaryDirectory,
  listRemoteBranches,
  removeDirectory,
  runCommand,
  waitForPullRequestForBranch,
  waitForRequiredChecksToPass,
} from './utils.js';

const E2E_TIMEOUT = 1000 * 60 * 60;
const ENABLED = process.env.AGENT_RUNTIME_KIT_E2E === '1';
const issueUrl = process.env.AGENT_RUNTIME_KIT_E2E_ISSUE_URL;
const cloneUrl = process.env.AGENT_RUNTIME_KIT_E2E_REPO_URL ?? getRepositoryCloneUrl(issueUrl);
const provider = process.env.AGENT_RUNTIME_KIT_E2E_PROVIDER ?? 'codex-sdk';
const runnerCommandTemplate = process.env.AGENT_RUNTIME_KIT_E2E_RUNNER_COMMAND;
const localVerificationCommand = process.env.AGENT_RUNTIME_KIT_E2E_VERIFY_COMMAND;
const rootDir = path.resolve(import.meta.dir, '..', '..');
const userProgramPath = path.join(rootDir, 'test', 'fixtures', 'github-pr-program.ts');

const githubPrTest = ENABLED ? test : test.skip;

githubPrTest(
  'creates a PR for a real GitHub issue and waits for required checks to pass',
  async () => {
    expect(issueUrl).toBeTruthy();
    expect(cloneUrl).toBeTruthy();
    expect(runnerCommandTemplate).toBeTruthy();

    const workDir = await createTemporaryDirectory('agent-runtime-kit-e2e');
    const repoDir = path.join(workDir, 'repo');

    let createdBranches: string[] = [];
    try {
      await runCommand(['git', 'clone', cloneUrl as string, repoDir], { streamOutput: true });

      const branchesBefore = new Set(await listRemoteBranches(repoDir));
      const runStartedAt = new Date();

      await runCommand(['bun', 'run', userProgramPath], {
        cwd: repoDir,
        env: {
          ...process.env,
          AGENT_RUNTIME_KIT_E2E_ISSUE_URL: issueUrl,
          AGENT_RUNTIME_KIT_E2E_PROVIDER: provider,
          AGENT_RUNTIME_KIT_E2E_REPO_URL: cloneUrl,
          AGENT_RUNTIME_KIT_E2E_REPO_DIR: repoDir,
          AGENT_RUNTIME_KIT_E2E_RUNNER_COMMAND: runnerCommandTemplate,
        },
        streamOutput: true,
      });

      await assertCleanWorkingTree(repoDir);

      const branchesAfter = await listRemoteBranches(repoDir);
      createdBranches = branchesAfter.filter((branchName: string) => !branchesBefore.has(branchName));
      expect(createdBranches.length).toBeGreaterThan(0);

      for (const branchName of createdBranches) {
        const pullRequest = await waitForPullRequestForBranch(repoDir, branchName);
        expect(new Date(pullRequest.createdAt).getTime()).toBeGreaterThanOrEqual(runStartedAt.getTime());
        await waitForRequiredChecksToPass(repoDir, pullRequest.number);
      }

      if (localVerificationCommand) {
        await runCommand(['zsh', '-lc', localVerificationCommand], {
          cwd: repoDir,
          streamOutput: true,
        });
      }
    } finally {
      for (const branchName of createdBranches) {
        await runCommand(['git', 'push', 'origin', '--delete', branchName], {
          cwd: repoDir,
          throwOnError: false,
        });
      }
      await removeDirectory(workDir);
    }
  },
  { timeout: E2E_TIMEOUT }
);

function getRepositoryCloneUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new URL(value);
  const [, owner, repo] = parsed.pathname.split('/');
  if (!owner || !repo) {
    return undefined;
  }

  return `https://github.com/${owner}/${repo}.git`;
}
