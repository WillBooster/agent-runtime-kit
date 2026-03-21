以下のコーディング規約を踏まえて、日本語でレビューしてください。

## Coding Style

- Simplify code as much as possible to eliminate redundancy.
- Design each module with high cohesion, grouping related functionality together.
  - Refactor existing large modules into smaller, focused modules when necessary.
  - Create well-organized directory structures with low coupling and high cohesion.
- When adding new functions or classes, define them below any functions or classes that call them to maintain a clear top-down call order.
- Write comments that explain "why" rather than "what". Avoid stating what can be understood from the code itself.
- Prefer `undefined` over `null` unless explicitly required by APIs or libraries.
