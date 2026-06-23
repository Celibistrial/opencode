# @opencode-ai/client

Private generation target for clients derived directly from OpenCode's authoritative Effect `HttpApi`.

## Entrypoints

- `@opencode-ai/client`: zero-Effect Promise client using `fetch`.
- `@opencode-ai/client/effect`: rich Effect network client using an environment-provided `HttpClient`.
- `@opencode-ai/client/effect/embedded`: scoped embedded OpenCode host backed by Core and the in-memory HTTP router.

The initial generated surface contains `sessions.list`, `create`, `get`, `switchAgent`, `switchModel`, and `prompt`, sourced directly from the V2 `HttpApi` hosted by `@opencode-ai/server`. Run `bun run generate` after changing that contract and `bun run check:generated` to detect committed-output drift.

The embedded entrypoint exposes a scoped host backed by the same server router, middleware, handlers, and HTTP codecs as the network client:

```ts
import { OpenCode } from "@opencode-ai/client/effect/embedded"

const opencode = yield * OpenCode.create()
const session = yield * opencode.sessions.get({ sessionID })
```

It also exposes embedded-only `tools.register(...)`. Closing the owning Effect Scope releases the router resources, location services, fibers, and scoped tool registrations.
