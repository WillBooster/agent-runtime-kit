import { expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

export interface RunResult {
  combined: string;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export async function createTemporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

export async function removeDirectory(directoryPath: string): Promise<void> {
  await rm(directoryPath, { force: true, recursive: true });
}

export async function runCommand(
  command: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    streamOutput?: boolean;
    throwOnError?: boolean;
  } = {}
): Promise<RunResult> {
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stdoutPromise = proc.stdout
    ? readStream(proc.stdout, options.streamOutput ? process.stdout : undefined)
    : Promise.resolve('');
  const stderrPromise = proc.stderr
    ? readStream(proc.stderr, options.streamOutput ? process.stderr : undefined)
    : Promise.resolve('');
  const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);
  const combined = `${stdout}${stderr}`;
  if ((options.throwOnError ?? true) && exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(' ')}\n${combined}`);
  }
  return { combined, exitCode, stderr, stdout };
}

export async function listRemoteBranches(repoDir: string): Promise<string[]> {
  const result = await runCommand(['git', 'for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], {
    cwd: repoDir,
  });
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((remoteRef) => remoteRef !== 'origin/HEAD')
    .map((remoteRef) => remoteRef.replace(/^origin\//u, ''));
}

export async function assertCleanWorkingTree(cwd: string): Promise<void> {
  const status = await runCommand(['git', 'status', '--porcelain'], { cwd });
  expect(status.stdout.trim()).toBe('');
}

export async function waitForPullRequestForBranch(
  repoDir: string,
  branchName: string,
  timeoutMs = 60_000
): Promise<{ createdAt: string; number: number; url: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastResponse = '';

  while (Date.now() < deadline) {
    const result = await runCommand(
      ['gh', 'pr', 'list', '--head', branchName, '--json', 'number,createdAt,url', '--jq', '.[0]'],
      { cwd: repoDir, throwOnError: false }
    );
    const trimmed = result.stdout.trim();
    if (trimmed && trimmed !== 'null') {
      try {
        const parsed = JSON.parse(trimmed) as Partial<{ createdAt: string; number: number; url: string }>;
        if (parsed.createdAt && parsed.number && parsed.url) {
          return {
            createdAt: parsed.createdAt,
            number: parsed.number,
            url: parsed.url,
          };
        }
      } catch {
        lastResponse = trimmed;
      }
    }
    await setTimeout(2000);
  }

  const details = lastResponse ? ` Last response: ${lastResponse}` : '';
  throw new Error(`Failed to find PR for branch ${branchName}.${details}`);
}

export async function waitForRequiredChecksToPass(
  repoDir: string,
  prNumber: number,
  intervalSeconds = 10
): Promise<void> {
  const requiredResult = await runCommand(
    [
      'gh',
      'pr',
      'checks',
      String(prNumber),
      '--required',
      '--watch',
      '--fail-fast',
      '--interval',
      String(intervalSeconds),
    ],
    {
      cwd: repoDir,
      streamOutput: true,
      throwOnError: false,
    }
  );
  if (requiredResult.exitCode === 0) {
    return;
  }
  if (requiredResult.combined.includes('no required checks reported')) {
    const result = await runCommand(
      ['gh', 'pr', 'checks', String(prNumber), '--watch', '--fail-fast', '--interval', String(intervalSeconds)],
      {
        cwd: repoDir,
        streamOutput: true,
        throwOnError: false,
      }
    );
    if (result.exitCode === 0) {
      return;
    }
    throw new Error(`Checks failed for PR #${prNumber}.\n${result.combined}`);
  }
  throw new Error(`Required checks failed for PR #${prNumber}.\n${requiredResult.combined}`);
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  output: NodeJS.WritableStream | undefined
): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text;
    }
    const chunk = decoder.decode(value);
    text += chunk;
    output?.write(chunk);
  }
}
