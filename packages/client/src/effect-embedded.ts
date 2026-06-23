export * as OpenCode from "./effect-embedded"

import { ApplicationTools } from "@opencode-ai/core/tool/application-tools"
import { createEmbeddedRoutes } from "@opencode-ai/server/routes"
import { Context, Effect, Layer } from "effect"
import { HttpClient, HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
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
        Effect.orDie,
      )
      return HttpServerResponse.toClientResponse(response)
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

export { ClientError } from "./generated-effect/index"
export { Tool } from "@opencode-ai/core/public/tool"
