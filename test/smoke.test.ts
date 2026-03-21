import { expect, test } from 'bun:test';

test('runs the entrypoint with Bun', async () => {
  const process = Bun.spawn(['bun', 'run', 'src/index.ts'], {
    cwd: `${import.meta.dir}/..`,
    stderr: 'pipe',
    stdout: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  expect(exitCode).toBe(0);
  expect(stderr).toBe('');
  expect(stdout).toContain('Hello via Bun!');
});
