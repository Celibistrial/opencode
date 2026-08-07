import { FinishReason, LLMEvent, ProviderMetadata, ToolResultValue } from "@opencode-ai/llm"
import { Schema } from "effect"
import { type streamText } from "ai"
import { errorMessage } from "@/util/error"

type Result = Awaited<ReturnType<typeof streamText>>
type AISDKEvent = Result["fullStream"] extends AsyncIterable<infer T> ? T : never

export function adapterState() {
  return {
    step: 0,
    text: 0,
    reasoning: 0,
    currentTextID: undefined as string | undefined,
    currentReasoningID: undefined as string | undefined,
    toolNames: {} as Record<string, string>,
    copilotTotalNanoAiu: undefined as number | undefined,
  }
}

// Compile the schema validators ONCE. `Schema.is(schema)` rebuilds the refinement
// function on every call, and these run per streamed token — recompiling per token
// was a major chunk of streaming CPU. Hoisting makes it a cheap function call.
const isFinishReason = Schema.is(FinishReason)
const isProviderMetadata = Schema.is(ProviderMetadata)

function finishReason(value: string | undefined): FinishReason {
  return isFinishReason(value) ? value : "unknown"
}

function providerMetadata(value: unknown): ProviderMetadata | undefined {
  if (value == null) return undefined
  return isProviderMetadata(value) ? value : undefined
}

// Temporary AI SDK bridge: Copilot billing survives only in raw provider chunks here.
// Move this extraction into @opencode-ai/llm when Copilot is handled by the native runtime.
function copilotTotalNanoAiu(value: unknown) {
  if (!value || typeof value !== "object") return
  const raw = value as Record<string, unknown>
  const response =
    raw.response && typeof raw.response === "object" ? (raw.response as Record<string, unknown>) : undefined
  const usage = raw.copilot_usage ?? response?.copilot_usage
  if (!usage || typeof usage !== "object") return
  const total = (usage as Record<string, unknown>).total_nano_aiu
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) return
  return total
}

function usage(value: unknown) {
  if (!value || typeof value !== "object") return undefined
  const item = value as {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    reasoningTokens?: number
    cachedInputTokens?: number
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number }
    outputTokenDetails?: { reasoningTokens?: number }
  }
  const entries = Object.entries({
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    totalTokens: item.totalTokens,
    reasoningTokens: item.outputTokenDetails?.reasoningTokens ?? item.reasoningTokens,
    cacheReadInputTokens: item.inputTokenDetails?.cacheReadTokens ?? item.cachedInputTokens,
    cacheWriteInputTokens: item.inputTokenDetails?.cacheWriteTokens,
  }).filter((entry) => entry[1] !== undefined)
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

function currentTextID(state: ReturnType<typeof adapterState>, id: string | undefined) {
  state.currentTextID = id ?? state.currentTextID ?? `text-${state.text++}`
  return state.currentTextID
}

function currentReasoningID(state: ReturnType<typeof adapterState>, id: string | undefined) {
  state.currentReasoningID = id ?? state.currentReasoningID ?? `reasoning-${state.reasoning++}`
  return state.currentReasoningID
}

export function toLLMEvents(
  state: ReturnType<typeof adapterState>,
  event: AISDKEvent,
): ReadonlyArray<LLMEvent> {
  switch (event.type) {
    case "start":
      return []

    case "start-step":
      return [LLMEvent.stepStart({ index: state.step })]

    case "finish-step": {
      const original = providerMetadata(event.providerMetadata)
      const metadata =
        state.copilotTotalNanoAiu === undefined
          ? original
          : {
              ...original,
              copilot: {
                ...original?.copilot,
                totalNanoAiu: state.copilotTotalNanoAiu,
              },
            }
      state.copilotTotalNanoAiu = undefined
      return [
        LLMEvent.stepFinish({
          index: state.step++,
          reason: finishReason(event.finishReason),
          usage: usage(event.usage),
          providerMetadata: metadata,
        }),
      ]
    }

    case "finish": {
      const events = [
        LLMEvent.finish({
          reason: finishReason(event.finishReason),
          usage: usage(event.totalUsage),
          providerMetadata: "providerMetadata" in event ? providerMetadata(event.providerMetadata) : undefined,
        }),
      ]
      // Reset so the adapter can be reused for a follow-up stream without leaking
      // counters or block IDs. adapterState() is the single source of truth for shape.
      Object.assign(state, adapterState())
      return events
    }

    case "text-start": {
      state.currentTextID = currentTextID(state, event.id)
      return [
        LLMEvent.textStart({
          id: state.currentTextID,
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]
    }

    // Hot path: text-delta / reasoning-delta / tool-input-delta fire per streamed
    // token. Returning a plain typed literal skips the Effect Schema validation
    // that the LLMEvent.*Delta() constructors run inside `.make()` on every call.
    // Validation buys nothing for objects we construct ourselves here, and per
    // token it was a measurable chunk of streaming CPU (the `toLLMEvents` frames
    // in the profile were dominated by Schema parsing). The literal is checked
    // structurally against the LLMEvent union by the return type — a shape drift
    // is a typecheck error, not a runtime surprise. Lower-frequency events below
    // keep the validated `.make` constructors.
    case "text-delta":
      return [
        {
          type: "text-delta",
          id: currentTextID(state, event.id),
          text: event.text,
          providerMetadata: providerMetadata(event.providerMetadata),
        },
      ]

    case "text-end": {
      const id = currentTextID(state, event.id)
      state.currentTextID = undefined
      return [
        LLMEvent.textEnd({
          id,
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]
    }

    case "reasoning-start": {
      state.currentReasoningID = currentReasoningID(state, event.id)
      return [
        LLMEvent.reasoningStart({
          id: state.currentReasoningID,
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]
    }

    case "reasoning-delta":
      return [
        {
          type: "reasoning-delta",
          id: currentReasoningID(state, event.id),
          text: event.text,
          providerMetadata: providerMetadata(event.providerMetadata),
        },
      ]

    case "reasoning-end": {
      const id = currentReasoningID(state, event.id)
      state.currentReasoningID = undefined
      return [
        LLMEvent.reasoningEnd({
          id,
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]
    }

    case "tool-input-start": {
      state.toolNames[event.id] = event.toolName
      return [
        LLMEvent.toolInputStart({
          id: event.id,
          name: event.toolName,
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]
    }

    case "tool-input-delta":
      return [
        {
          type: "tool-input-delta",
          id: event.id,
          name: state.toolNames[event.id] ?? "unknown",
          text: event.delta ?? "",
        },
      ]

    case "tool-input-end":
      return [
        LLMEvent.toolInputEnd({
          id: event.id,
          name: state.toolNames[event.id] ?? "unknown",
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]

    case "tool-call": {
      state.toolNames[event.toolCallId] = event.toolName
      return [
        LLMEvent.toolCall({
          id: event.toolCallId,
          name: event.toolName,
          input: event.input,
          providerExecuted: "providerExecuted" in event ? event.providerExecuted : undefined,
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]
    }

    case "tool-result": {
      const name = state.toolNames[event.toolCallId] ?? "unknown"
      delete state.toolNames[event.toolCallId]
      return [
        LLMEvent.toolResult({
          id: event.toolCallId,
          name,
          result: ToolResultValue.make(event.output),
          providerExecuted: "providerExecuted" in event ? event.providerExecuted : undefined,
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]
    }

    case "tool-error": {
      const name = state.toolNames[event.toolCallId] ?? ("toolName" in event ? event.toolName : "unknown")
      delete state.toolNames[event.toolCallId]
      return [
        LLMEvent.toolError({
          id: event.toolCallId,
          name,
          message: errorMessage(event.error),
          error: event.error,
          providerMetadata: providerMetadata(event.providerMetadata),
        }),
      ]
    }

    // A stream error is surfaced by throwing; the processor's stream pipeline
    // squashes the resulting defect into a typed failure for retry/halt handling.
    case "error":
      throw event.error

    case "abort":
    case "source":
    case "file":
    case "tool-output-denied":
    case "tool-approval-request":
      return []

    case "raw": {
      state.copilotTotalNanoAiu = copilotTotalNanoAiu(event.rawValue) ?? state.copilotTotalNanoAiu
      return []
    }

    default: {
      const _exhaustive: never = event
      void _exhaustive
      return []
    }
  }
}

export * as LLMAISDK from "./ai-sdk"
