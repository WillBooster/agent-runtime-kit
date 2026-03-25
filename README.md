# agent-runtime-kit

A provider-agnostic SDK for orchestrating AI agent sessions, streaming events, and structured outputs across multiple coding agent backends.

[![Test](https://github.com/WillBooster/agent-runtime-kit/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/agent-runtime-kit/actions/workflows/test.yml)

## GitHub E2E

The repository includes an opt-in e2e test that exercises a user program built on top of this wrapper. The user program receives a real GitHub issue URL, asks an external agent runner to implement the fix and open a PR, then the test waits until the PR's required GitHub checks pass.

Set these environment variables before running `bun run test:e2e-github`:

- `AGENT_RUNTIME_KIT_E2E=1`
- `AGENT_RUNTIME_KIT_E2E_ISSUE_URL`
- `AGENT_RUNTIME_KIT_E2E_RUNNER_COMMAND`
- `AGENT_RUNTIME_KIT_E2E_PROVIDER` (`codex-sdk` by default, or `agent-sdk`)
- `AGENT_RUNTIME_KIT_E2E_REPO_URL` (optional if the issue URL points to GitHub)
- `AGENT_RUNTIME_KIT_E2E_VERIFY_COMMAND` (optional local verification command after PR creation)

`AGENT_RUNTIME_KIT_E2E_RUNNER_COMMAND` is a shell template. The user program expands `{cwd}`, `{issueUrl}`, `{instructionsPath}`, and `{provider}` before executing it.
