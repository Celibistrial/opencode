# @opencode-ai/client

Private generation target for clients derived directly from OpenCode's authoritative Effect `HttpApi`.

## Entrypoints

- `@opencode-ai/client`: zero-Effect Promise client using `fetch`.
- `@opencode-ai/client/effect`: rich Effect network client using an environment-provided `HttpClient`.
- `@opencode-ai/client/effect/embedded`: scoped embedded OpenCode host backed by Core and the in-memory HTTP router.

The initial generated surface contains `sessions.list`, `create`, `get`, `switchAgent`, `switchModel`, and `prompt`. The server and generator reuse the same endpoint declarations, while generation temporarily composes a lightweight projection group to keep the network Effect entrypoint isolated from the heavy Core/server runtime graph. Run `bun run generate` after changing that contract and `bun run check:generated` to detect committed-output drift.

This projection is a beta implementation compromise. The intended stable design is one browser-safe authoritative `SessionGroup`, imported directly by both the server and codegen after its schema and middleware-tag dependencies have been isolated into lightweight modules. The migration checklist is recorded in `CONTEXT.md` under "Deferred client contract cleanup."

The embedded entrypoint exposes a scoped host backed by the same server router, middleware, handlers, and HTTP codecs as the network client:

```ts
import { OpenCode } from "@opencode-ai/client/effect/embedded"

const opencode = yield * OpenCode.create()
const session = yield * opencode.sessions.get({ sessionID })
```

It also exposes embedded-only `tools.register(...)`. Closing the owning Effect Scope releases the router resources, location services, fibers, and scoped tool registrations.

The beta embedded host currently assumes one active host per database. Multiple hosts sharing durable Session storage require shared process-local execution coordination and remain deferred together with embedded streaming support.
