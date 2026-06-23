# @opencode-ai/client

Private generation target for clients derived directly from OpenCode's authoritative Effect `HttpApi`.

## Entrypoints

- `@opencode-ai/client`: zero-Effect Promise client using `fetch`.
- `@opencode-ai/client/effect`: rich Effect network client using an environment-provided `HttpClient`.
- `@opencode-ai/client/effect/embedded`: scoped embedded OpenCode host backed by Core and the in-memory HTTP router.

The initial generated surface contains `sessions.list`, `create`, `get`, `switchAgent`, `switchModel`, and `prompt`, sourced from the public `HttpApi` in `@opencode-ai/api` and hosted by `@opencode-ai/server`. Run `bun run generate` after changing that contract and `bun run check:generated` to detect committed-output drift.

The embedded entrypoint remains intentionally empty until the scoped in-memory host is implemented.
