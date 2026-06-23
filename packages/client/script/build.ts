import { NodeFileSystem } from "@effect/platform-node"
import {
  SessionsCreate,
  SessionsGet,
  SessionsList,
  SessionsPrompt,
  SessionsSwitchAgent,
  SessionsSwitchModel,
} from "@opencode-ai/server/groups/session-endpoints"
import { compile, emitEffectImported, emitPromise, write } from "@opencode-ai/httpapi-codegen"
import { Effect } from "effect"
import { HttpApi, HttpApiGroup } from "effect/unstable/httpapi"

const Api = HttpApi.make("opencode-client").add(
  HttpApiGroup.make("sessions")
    .add(SessionsList)
    .add(SessionsCreate)
    .add(SessionsGet)
    .add(SessionsSwitchAgent)
    .add(SessionsSwitchModel)
    .add(SessionsPrompt),
)
const contract = compile(Api)

await Effect.runPromise(
  Effect.all(
    [
      write(emitPromise(contract), new URL("../src/generated", import.meta.url).pathname),
      write(
        emitEffectImported(contract, {
          module: "@opencode-ai/server/groups/session-endpoints",
          endpoints: {
            "sessions.list": "SessionsList",
            "sessions.create": "SessionsCreate",
            "sessions.get": "SessionsGet",
            "sessions.switchAgent": "SessionsSwitchAgent",
            "sessions.switchModel": "SessionsSwitchModel",
            "sessions.prompt": "SessionsPrompt",
          },
        }),
        new URL("../src/generated-effect", import.meta.url).pathname,
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
