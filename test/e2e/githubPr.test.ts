import { expect, test } from 'bun:test';
import path from 'node:path';
import { SUPPORTED_RUNTIME_PROVIDERS } from '../../src/index.js';
import {
  assertCleanWorkingTree,
  createTemporaryDirectory,
  listRemoteBranches,
  removeDirectory,
  runCommand,
  waitForPullRequestForBranch,
  waitForRequiredChecksToPass,
} from './utils.js';

const DEFAULT_BRANCH = 'main';
const E2E_TIMEOUT = 1000 * 60 * 60;
const ISSUE_URL = 'https://github.com/exKAZUu/agent-benchmark/issues/1';
const REPO_URL = 'https://github.com/exKAZUu/agent-benchmark.git';
const rootDir = path.resolve(import.meta.dir, '..', '..');
const userProgramPath = path.join(rootDir, 'test', 'fixtures', 'github-pr-program.ts');
const runtimeTest = process.env.CI ? test.skip : test;

for (const provider of SUPPORTED_RUNTIME_PROVIDERS) {
  runtimeTest(
    `creates a PR for ${ISSUE_URL} with ${provider} and waits for required checks to pass`,
    async () => {
      const workDir = await createTemporaryDirectory('agent-runtime-kit-e2e');
      const repoDir = path.join(workDir, 'repo');

      let createdBranches: string[] = [];
      try {
        await runCommand(['git', 'clone', REPO_URL, repoDir], { streamOutput: true });
        await runCommand(['git', 'checkout', DEFAULT_BRANCH], { cwd: repoDir });

        const branchesBefore = new Set(await listRemoteBranches(repoDir));
        const runStartedAt = new Date();

        await runCommand(['bun', 'run', userProgramPath], {
          cwd: repoDir,
          env: {
            ...process.env,
            AGENT_RUNTIME_KIT_PROVIDER: provider,
          },
          streamOutput: true,
        });

        await assertCleanWorkingTree(repoDir);

        const branchesAfter = await listRemoteBranches(repoDir);
        createdBranches = branchesAfter.filter((branchName) => !branchesBefore.has(branchName));
        expect(createdBranches.length).toBeGreaterThan(0);

        for (const branchName of createdBranches) {
          const pullRequest = await waitForPullRequestForBranch(repoDir, branchName);
          expect(new Date(pullRequest.createdAt).getTime()).toBeGreaterThanOrEqual(runStartedAt.getTime());
          await waitForRequiredChecksToPass(repoDir, pullRequest.number);
        }

        await runCommand(['bun', 'install'], { cwd: repoDir });
        await runCommand(['bun', 'test'], { cwd: repoDir });
        await validateIssueOneOutput(repoDir);
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
}

async function validateIssueOneOutput(repoDir: string): Promise<void> {
  const result = await runCommand(['bun', 'run', 'src/index.ts', 'hello'], {
    cwd: repoDir,
    throwOnError: false,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Hello, World!');
}
