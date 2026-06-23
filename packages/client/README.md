# @opencode-ai/client

Private generation target for clients derived directly from OpenCode's authoritative Effect `HttpApi`.

## Entrypoints

- `@opencode-ai/client`: zero-Effect Promise client using `fetch`.
- `@opencode-ai/client/effect`: rich Effect network client using an environment-provided `HttpClient`.

The generated surface contains `sessions.list`, `create`, `get`, `switchAgent`, `switchModel`, `prompt`, `compact`, `wait`, and `context`. The server and generator consume the exact same hosted `SessionGroup`. Run `bun run generate` after changing that contract and `bun run check:generated` to detect committed-output drift.

The Effect entrypoint uses canonical decoded values such as `Session.ID`, `Location.Ref`, and `Prompt`. These datatypes come from the lightweight `@opencode-ai/schema` package and are re-exported so callers depend only on the client surface. The authoritative `SessionGroup` lives in `@opencode-ai/protocol`; Server hosts that exact group and adapts it to Core.

The Promise root remains structural and has no Core or Effect runtime dependency. `/effect` depends only on Effect, Schema, and Protocol and is browser-bundle safe. Bundle-boundary tests enforce both import graphs.

Effect consumers construct canonical decoded inputs:

```ts
import { AbsolutePath, Location, OpenCode, Prompt } from "@opencode-ai/client/effect"

const client = yield * OpenCode.make({ baseUrl: "https://opencode.example" })
yield *
  client.sessions.create({
    location: Location.Ref.make({ directory: AbsolutePath.make("/workspace") }),
  })
yield * client.sessions.prompt({ sessionID, prompt: Prompt.make({ text: "Hello" }) })
```
