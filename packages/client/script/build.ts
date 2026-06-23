import { NodeFileSystem } from "@effect/platform-node"
import { Api } from "@opencode-ai/api"
import { compile, emitEffectImported, emitPromise, write } from "@opencode-ai/httpapi-codegen"
import { Effect } from "effect"

const contract = compile(Api)

await Effect.runPromise(
  Effect.all(
    [
      write(emitPromise(contract), new URL("../src/generated", import.meta.url).pathname),
      write(
        emitEffectImported(contract, { module: "@opencode-ai/api", api: "Api" }),
        new URL("../src/generated-effect", import.meta.url).pathname,
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
