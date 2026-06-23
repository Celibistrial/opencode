# @opencode-ai/client

Private generation target for clients derived directly from OpenCode's authoritative Effect `HttpApi`.

## Entrypoints

- `@opencode-ai/client`: zero-Effect Promise client using `fetch`.
- `@opencode-ai/client/effect`: rich Effect network client using an environment-provided `HttpClient`.
- `@opencode-ai/client/effect/embedded`: scoped embedded OpenCode host backed by Core and the in-memory HTTP router.

The generated surface contains `sessions.list`, `create`, `get`, `switchAgent`, `switchModel`, `prompt`, `compact`, `wait`, and `context`. The server and generator consume the exact same hosted `SessionGroup`. Run `bun run generate` after changing that contract and `bun run check:generated` to detect committed-output drift.

During beta, the Effect entrypoints use canonical decoded values such as `Session.ID`, `Location.Ref`, and `Prompt`; the network entrypoint therefore accepts the authoritative group's heavy Core/server import graph. These datatypes are re-exported from both Effect entrypoints so callers do not depend on their current Core module locations or internal versioned names. The Promise root remains structural and has no Core or Effect runtime dependency.

The intended stable design extracts shared structural domain schemas into a lightweight model leaf and the authoritative `HttpApi` into a lightweight protocol leaf. Core and Protocol reuse the model; Server hosts Protocol and adapts it to Core; `/effect` depends only on Effect and Protocol; `/effect/embedded` retains Core and Server internally. This preserves the public root, `/effect`, and `/effect/embedded` entrypoints. The migration checklist is recorded in `CONTEXT.md` under "Deferred client contract cleanup."

Until that extraction, Effect consumers construct canonical decoded inputs:

```ts
import { AbsolutePath, Location, OpenCode, Prompt } from "@opencode-ai/client/effect"

const client = yield * OpenCode.make({ baseUrl: "https://opencode.example" })
yield *
  client.sessions.create({
    location: Location.Ref.make({ directory: AbsolutePath.make("/workspace") }),
  })
yield * client.sessions.prompt({ sessionID, prompt: new Prompt({ text: "Hello" }) })
```

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
