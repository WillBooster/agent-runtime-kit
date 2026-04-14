# agent-runtime-kit

[![Test](https://github.com/WillBooster/agent-runtime-kit/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/agent-runtime-kit/actions/workflows/test.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

A provider-agnostic SDK for orchestrating AI agent sessions, streaming events, and structured outputs across multiple coding agent backends.

## Installation

```sh
npm install agent-runtime-kit
```

## Usage

```ts
import { createCodexRuntime } from 'agent-runtime-kit';

const runtime = createCodexRuntime();

const result = await runtime.run(
  {
    cwd: process.cwd(),
    instructions: 'Summarize the current repository structure.',
  },
  {
    includeLogs: true,
  }
);

console.log(result.outputText);
console.log(result.logs);
```

```ts
const eventFilter = (event: { type: string }) => event.type !== 'turn.started';

for await (const event of runtime.runStream(
  {
    cwd: process.cwd(),
    instructions: 'Summarize the current repository structure.',
  },
  {
    eventFilter,
  }
)) {
  console.log(event);
}
```

## GitHub E2E

The repository includes a fixed end-to-end test for a user program built on top of this wrapper. The user program targets `exKAZUu/agent-benchmark` issue `#1`, asks either the Codex SDK or the Claude Agent SDK to implement the fix and open a PR, then the test waits until the PR's required GitHub checks pass.

The e2e test is skipped only when `CI` is set. Outside CI, `bun test` runs the fixed e2e for every provider listed in `SUPPORTED_RUNTIME_PROVIDERS`, so adding a new SDK requires updating that provider list and the tests will cover it automatically.

## License

Apache License 2.0
