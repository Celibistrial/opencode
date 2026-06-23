import { NodeFileSystem } from "@effect/platform-node"
import { SessionGroup } from "@opencode-ai/protocol/session"
import { compile, emitEffectImported, emitPromise, write } from "@opencode-ai/httpapi-codegen"
import { Effect } from "effect"
import { HttpApi } from "effect/unstable/httpapi"
import { fileURLToPath } from "url"

const contract = compile(HttpApi.make("opencode-client").add(SessionGroup), {
  groupNames: { "server.session": "sessions" },
})

await Effect.runPromise(
  Effect.all(
    [
      write(emitPromise(contract), fileURLToPath(new URL("../src/generated", import.meta.url))),
      write(
        emitEffectImported(contract, {
          module: "@opencode-ai/protocol/session",
          group: "SessionGroup",
        }),
        fileURLToPath(new URL("../src/generated-effect", import.meta.url)),
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
