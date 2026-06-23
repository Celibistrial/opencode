# @opencode-ai/client

Private generation target for clients derived directly from OpenCode's authoritative Effect `HttpApi`.

## Entrypoints

- `@opencode-ai/client`: zero-Effect Promise client using `fetch`.
- `@opencode-ai/client/effect`: rich Effect network client using an environment-provided `HttpClient`.
- `@opencode-ai/client/effect/embedded`: scoped embedded OpenCode host backed by Core and the in-memory HTTP router.

The generated surface contains `sessions.list`, `create`, `get`, `switchAgent`, `switchModel`, `prompt`, `compact`, `wait`, and `context`. The server and generator consume the exact same hosted `SessionGroup`. Run `bun run generate` after changing that contract and `bun run check:generated` to detect committed-output drift.

During alpha, the Effect network entrypoint accepts the authoritative group's heavy Core/server import graph. The intended stable design keeps the same group while isolating its schema and middleware-tag dependencies into lightweight modules. The migration checklist is recorded in `CONTEXT.md` under "Deferred client contract cleanup."

The embedded entrypoint exposes a scoped host backed by the same server router, middleware, handlers, and HTTP codecs as the network client:

```ts
import { OpenCode } from "@opencode-ai/client/effect/embedded"

const opencode = yield * OpenCode.create()
const session = yield * opencode.sessions.get({ sessionID })
```

It also exposes embedded-only `tools.register(...)`. Closing the owning Effect Scope releases the router resources, location services, fibers, and scoped tool registrations.

Effect applications can provide the same scoped constructor as a service Layer:

```ts
const program = Effect.gen(function* () {
  const opencode = yield* OpenCode.Service
  return yield* opencode.sessions.get({ sessionID })
})

yield * program.pipe(Effect.provide(OpenCode.layer))
```

`OpenCode.layer` is only a dependency-injection adapter over `OpenCode.create()`; it does not define another embedded implementation.

The beta embedded host currently assumes one active host per database. Multiple hosts sharing durable Session storage require shared process-local execution coordination and remain deferred together with embedded streaming support.
