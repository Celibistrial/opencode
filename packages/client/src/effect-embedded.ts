export * as OpenCode from "./effect-embedded"

import { ApplicationTools } from "@opencode-ai/core/tool/application-tools"
import { createEmbeddedRoutes } from "@opencode-ai/server/routes"
import { Cause, Context, Effect, Layer } from "effect"
import {
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http"
import { OpenCode as Generated } from "./generated-effect/index"

export const create = Effect.fn("OpenCode.create")(function* () {
  const context = yield* Layer.build(
    Layer.merge(
      createEmbeddedRoutes().pipe(Layer.provide(HttpServer.layerServices), Layer.provideMerge(HttpRouter.layer)),
      ApplicationTools.layer,
    ),
  )
  const handler = Context.get(context, HttpRouter.HttpRouter).asHttpEffect()
  const httpClient = HttpClient.make(
    Effect.fnUntraced(function* (request) {
      const response = yield* handler.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, HttpServerRequest.fromClientRequest(request)),
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.interrupt
            : HttpServerError.causeResponse(cause).pipe(Effect.map(([response]) => response)),
        ),
      )
      return HttpServerResponse.toClientResponse(response, { request })
    }, Effect.scoped),
  )
  const client = yield* Generated.make({ baseUrl: "http://opencode.local" }).pipe(
    Effect.provideService(HttpClient.HttpClient, httpClient),
  )
  const tools = Context.get(context, ApplicationTools.Service)
  return {
    ...client,
    tools: { register: tools.register },
  }
})

export type Interface = Effect.Success<ReturnType<typeof create>>

export class Service extends Context.Service<Service, Interface>()("@opencode-ai/client/OpenCode") {}

export const layer = Layer.effect(Service, create())

export { ClientError } from "./generated-effect/index"
export { Tool } from "@opencode-ai/core/public/tool"
export {
  AgentV2,
  Location,
  ModelV2,
  AbsolutePath,
  RelativePath,
  SessionV2,
  SessionInput,
  SessionMessage,
  Prompt,
} from "./effect"
