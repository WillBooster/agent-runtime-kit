# agent-runtime-kit

A provider-agnostic SDK for orchestrating AI agent sessions, streaming events, and structured outputs across multiple coding agent backends.

[![Test](https://github.com/WillBooster/agent-runtime-kit/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/agent-runtime-kit/actions/workflows/test.yml)

## GitHub E2E

The repository includes a fixed end-to-end test for a user program built on top of this wrapper. The user program targets `exKAZUu/agent-benchmark` issue `#1`, asks either the Codex SDK or the Claude Agent SDK to implement the fix and open a PR, then the test waits until the PR's required GitHub checks pass.

The e2e test is skipped only when `CI` is set. Outside CI, `bun test` runs the fixed e2e for every provider listed in `SUPPORTED_RUNTIME_PROVIDERS`, so adding a new SDK requires updating that provider list and the tests will cover it automatically.
