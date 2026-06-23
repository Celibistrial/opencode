import { NodeFileSystem } from "@effect/platform-node"
import { SessionGroup } from "@opencode-ai/server/groups/session"
import { compile, emitEffectImported, emitPromise, write } from "@opencode-ai/httpapi-codegen"
import { Effect } from "effect"
import { HttpApi } from "effect/unstable/httpapi"

const Api = HttpApi.make("opencode-client").add(SessionGroup)
const contract = compile(Api, { groupNames: { "server.session": "sessions" } })

await Effect.runPromise(
  Effect.all(
    [
      write(emitPromise(contract), new URL("../src/generated", import.meta.url).pathname),
      write(
        emitEffectImported(contract, {
          module: "@opencode-ai/server/groups/session",
          group: "SessionGroup",
        }),
        new URL("../src/generated-effect", import.meta.url).pathname,
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
