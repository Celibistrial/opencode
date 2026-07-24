import type { Auth } from "@/auth"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { errorMessage } from "@/util/error"
import { isRecord } from "@/util/record"
import { asSchema, type ModelMessage, type Tool } from "ai"
import { Cause, Effect, FiberSet, Queue } from "effect"
import * as Stream from "effect/Stream"
import { FetchHttpClient } from "effect/unstable/http"
import {
  Tool as NativeTool,
  ToolFailure,
  ToolRuntime,
  toDefinitions,
  type JsonSchema,
  type LLMEvent,
} from "@opencode-ai/llm"
import type { LLMClientShape } from "@opencode-ai/llm/route"
import { LLMNative } from "./native-request"

export type RuntimeStatus =
  | { readonly type: "supported"; readonly apiKey: string; readonly baseURL?: string }
  | { readonly type: "unsupported"; readonly reason: string }
export type StreamResult =
  | { readonly type: "supported"; readonly stream: Stream.Stream<LLMEvent, unknown> }
  | { readonly type: "unsupported"; readonly reason: string }

type StreamInput = {
  readonly model: Provider.Model
  readonly provider: Provider.Info
  readonly auth: Auth.Info | undefined
  readonly llmClient: LLMClientShape
  readonly messages: ModelMessage[]
  readonly tools: Record<string, Tool>
  readonly toolChoice?: "auto" | "required" | "none"
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly maxOutputTokens?: number
  readonly providerOptions?: Record<string, any>
  readonly headers: Record<string, string>
  readonly abort: AbortSignal
}

export function status(input: Pick<StreamInput, "model" | "provider" | "auth">): RuntimeStatus {
  return statusWithFetch(input, providerFetch(input))
}

function statusWithFetch(
  input: Pick<StreamInput, "model" | "provider" | "auth">,
  fetch: typeof globalThis.fetch | undefined,
): RuntimeStatus {
  const providerID = input.model.providerID
  const npm = input.model.api.npm
  if (npm !== "@ai-sdk/openai" && npm !== "@ai-sdk/openai-compatible" && npm !== "@ai-sdk/anthropic")
    return { type: "unsupported", reason: "provider package is not OpenAI, OpenAI-compatible, or Anthropic" }
  // First-party OpenAI/Anthropic packages stay pinned to their own provider IDs.
  // OpenAI-compatible providers (deepseek, groq, together, …) all speak the same
  // wire protocol, so the native openai-compatible-chat route handles any of them
  // by provider id — no per-provider allowlist needed.
  if (
    npm !== "@ai-sdk/openai-compatible" &&
    providerID !== "openai" &&
    providerID !== "anthropic" &&
    !providerID.startsWith("opencode")
  )
    return { type: "unsupported", reason: "provider is not openai, opencode, or anthropic" }
  if (input.auth?.type === "oauth" && !(input.provider.id === "openai" && fetch)) {
    return { type: "unsupported", reason: "OAuth auth requires a provider fetch override" }
  }
  // Some openai-compatible providers rely on custom fetch middleware for
  // correctness (e.g. snowflake-cortex rewrites max_tokens -> max_completion_tokens
  // and masks completion-signalling 400s). The native runtime only forwards a
  // provider fetch on the openai+oauth path (`fetch` above); if a provider ships
  // fetch middleware that won't be forwarded, native would send raw requests and
  // break it, so fall back to the AI-SDK path.
  if (typeof input.provider.options.fetch === "function" && !fetch)
    return { type: "unsupported", reason: "provider uses custom fetch middleware unsupported by the native runtime" }

  const apiKey = typeof input.provider.options.apiKey === "string" ? input.provider.options.apiKey : input.provider.key
  if (!apiKey) return { type: "unsupported", reason: "API key is not configured" }

  // OpenAI-compatible routes require an explicit base URL — the native request
  // adapter throws if it can't resolve one (native-request.ts requireBaseURL).
  // Guard here so a missing URL degrades to the AI-SDK fallback instead of a
  // hard stream failure.
  const baseURL =
    typeof input.provider.options.baseURL === "string"
      ? input.provider.options.baseURL
      : input.model.api.url || undefined
  if (npm === "@ai-sdk/openai-compatible" && !baseURL)
    return { type: "unsupported", reason: "OpenAI-compatible provider has no resolvable base URL" }

  return {
    type: "supported",
    apiKey,
    baseURL,
  }
}

export function stream(input: StreamInput): StreamResult {
  const fetch = providerFetch(input)
  const current = statusWithFetch(input, fetch)
  if (current.type === "unsupported") return current

  // Integration point with @opencode-ai/llm: native-request lowers session data
  // into an LLMRequest, then LLMClient handles route selection and transport.
  //
  // ProviderTransform.providerOptions builds AI-SDK-shaped options for the
  // selected SDK key (e.g. "openai") and the native LLM SDK reads the same
  // keys via OpenAIOptions.* (store, reasoningEffort, reasoningSummary,
  // include, textVerbosity, promptCacheKey). Both sides intentionally use
  // OpenAI's official wire field names, so this is identity, not translation
  // — if a field ever needs to differ between the two surfaces, the
  // translation belongs here, not split across both packages.
  const tools = nativeTools(input.tools, input)
  // Build the request ONCE with the tool definitions included. Previously the
  // request was built without tools and then rebuilt via LLMRequest.update just to
  // attach them, which re-extracted and re-constructed every message (a second
  // full O(history) Schema-class build per turn).
  const request = LLMNative.request({
    model: input.model,
    apiKey: current.apiKey,
    baseURL: current.baseURL,
    messages: ProviderTransform.message(input.messages, input.model, input.providerOptions ?? {}),
    toolDefinitions: toDefinitions(tools),
    toolChoice: input.toolChoice,
    temperature: input.temperature,
    topP: input.topP,
    topK: input.topK,
    maxOutputTokens: input.maxOutputTokens,
    providerOptions: ProviderTransform.providerOptions(input.model, input.providerOptions ?? {}),
    headers: { ...providerHeaders(input.provider.options.headers), ...input.headers },
  })
  const stream = Stream.scoped(
    Stream.unwrap(
      Effect.gen(function* () {
        const settlements = yield* FiberSet.make<void>()
        const results = yield* Queue.unbounded<LLMEvent, Cause.Done>()
        const provider = input.llmClient.stream(request).pipe(
          Stream.flatMap((event) =>
            event.type !== "tool-call" || event.providerExecuted
              ? Stream.make(event)
              : Stream.make(event).pipe(
                  Stream.concat(
                    Stream.fromEffectDrain(
                      ToolRuntime.dispatch(tools, event).pipe(
                        Effect.flatMap((dispatched) => Queue.offerAll(results, dispatched.events)),
                        Effect.catchCause((cause) => Queue.failCause(results, cause)),
                        Effect.asVoid,
                        FiberSet.run(settlements, { startImmediately: true }),
                      ),
                    ),
                  ),
                ),
          ),
          Stream.concat(
            Stream.fromEffectDrain(
              FiberSet.awaitEmpty(settlements).pipe(Effect.andThen(Queue.end(results)), Effect.asVoid),
            ),
          ),
        )
        return provider.pipe(Stream.concat(Stream.fromQueue(results)))
      }),
    ),
  )

  return {
    ...current,
    stream: fetch ? stream.pipe(Stream.provideService(FetchHttpClient.Fetch, fetch)) : stream,
  }
}

function providerFetch(input: Pick<StreamInput, "provider" | "auth">): typeof globalThis.fetch | undefined {
  if (input.provider.id !== "openai" || input.auth?.type !== "oauth") return undefined
  const value: unknown = input.provider.options.fetch
  if (typeof value !== "function") return undefined
  return value as typeof globalThis.fetch
}

function providerHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

function nativeSchema(value: unknown): JsonSchema {
  if (!value || typeof value !== "object") return { type: "object", properties: {} }
  if ("jsonSchema" in value && value.jsonSchema && typeof value.jsonSchema === "object")
    return value.jsonSchema as JsonSchema
  return asSchema(value as Parameters<typeof asSchema>[0]).jsonSchema as JsonSchema
}

export function nativeTools(tools: Record<string, Tool>, input: Pick<StreamInput, "messages" | "abort">) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, item]) => [
      name,
      // Tool execution remains opencode-owned. The native runtime only adapts
      // the @opencode-ai/llm tool call back into the AI SDK Tool.execute shape.
      NativeTool.make({
        description: item.description ?? "",
        jsonSchema: nativeSchema(item.inputSchema),
        execute: (args: unknown, ctx) =>
          Effect.tryPromise({
            try: () => {
              if (!item.execute) throw new Error(`Tool has no execute handler: ${name}`)
              return item.execute(args, {
                toolCallId: ctx?.id ?? name,
                messages: input.messages,
                abortSignal: input.abort,
              })
            },
            catch: (error) => new ToolFailure({ message: errorMessage(error), error }),
          }),
      }),
    ]),
  )
}

export * as LLMNativeRuntime from "./native-runtime"
