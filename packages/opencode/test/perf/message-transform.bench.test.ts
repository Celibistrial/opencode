import { describe, test } from "bun:test"
import { MessageV2 } from "@/session/message-v2"
import { ProviderTransform } from "@/provider/transform"
import type { Provider } from "@/provider/provider"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

// Ground-truth bench for Opt #1: how expensive is the per-turn request-build
// path (toModelMessages -> ProviderTransform.message) and how does it scale as
// the conversation grows? Run: bun test test/perf/message-transform.bench.test.ts

const model = {
  providerID: "deepseek",
  id: "deepseek-chat",
  release_date: "2024-01-01",
  reasoning_options: undefined,
  variants: undefined,
  capabilities: { input: { text: true, image: false }, interleaved: false, reasoning: false },
  limit: { output: 8192, context: 128000 },
  api: { npm: "@ai-sdk/openai-compatible", id: "deepseek-chat", url: "https://api.deepseek.com" },
} as unknown as Provider.Model

const bigText = "lorem ipsum dolor sit amet ".repeat(40) // ~1KB
const bigOutput = "tool output line\n".repeat(300) // ~5KB

function userMsg(i: number): SessionV1.WithParts {
  return {
    info: { id: `msg_u_${i}`, role: "user" } as any,
    parts: [{ type: "text", text: `User turn ${i}: ${bigText}` }] as any,
  }
}

function assistantMsg(i: number): SessionV1.WithParts {
  return {
    info: { id: `msg_a_${i}`, role: "assistant", providerID: "deepseek", modelID: "deepseek-chat" } as any,
    parts: [
      { type: "step-start" },
      { type: "reasoning", text: `reasoning ${i} ${bigText}`, metadata: {} },
      {
        type: "tool",
        tool: "bash",
        callID: `call_${i}`,
        state: {
          status: "completed",
          input: { command: `echo ${i}` },
          output: bigOutput,
          time: { start: 1, end: 2 },
          attachments: [],
        },
        metadata: {},
      },
      { type: "text", text: `Assistant turn ${i}: ${bigText}`, metadata: {} },
    ] as any,
  }
}

const anthropicModel = {
  providerID: "anthropic",
  id: "claude-sonnet-5",
  release_date: "2025-01-01",
  reasoning_options: undefined,
  variants: undefined,
  capabilities: { input: { text: true, image: false }, interleaved: false, reasoning: false },
  limit: { output: 8192, context: 200000 },
  api: { npm: "@ai-sdk/anthropic", id: "claude-sonnet-5", url: "https://api.anthropic.com" },
} as unknown as Provider.Model

async function buildTurn(history: SessionV1.WithParts[]) {
  const converted = await MessageV2.toModelMessages(history, model)
  return ProviderTransform.message(converted, model, {})
}

describe("perf: message transform per-turn", () => {
  test("simulate a growing conversation", async () => {
    const TURNS = 60
    const history: SessionV1.WithParts[] = []
    // warm
    history.push(userMsg(0), assistantMsg(0))
    await buildTurn(history)

    const perTurn: number[] = []
    const overall = performance.now()
    for (let i = 1; i <= TURNS; i++) {
      history.push(userMsg(i), assistantMsg(i))
      const t = performance.now()
      await buildTurn(history)
      perTurn.push(performance.now() - t)
    }
    const total = performance.now() - overall

    const first = perTurn[0]
    const last = perTurn[perTurn.length - 1]
    const sum = perTurn.reduce((a, b) => a + b, 0)
    console.log(`\n=== message-transform bench (${TURNS} turns, history -> ${history.length} msgs) ===`)
    console.log(`first turn:  ${first.toFixed(2)}ms`)
    console.log(`last turn:   ${last.toFixed(2)}ms  (${(last / first).toFixed(1)}x first)`)
    console.log(`sum perTurn: ${sum.toFixed(1)}ms`)
    console.log(`total wall:  ${total.toFixed(1)}ms`)

    // isolate the two phases on the final (largest) history
    const N = 30
    let tConv = 0
    for (let k = 0; k < N; k++) {
      const t = performance.now()
      await MessageV2.toModelMessages(history, model)
      tConv += performance.now() - t
    }
    const converted = await MessageV2.toModelMessages(history, model)
    let tTransform = 0
    for (let k = 0; k < N; k++) {
      const t = performance.now()
      ProviderTransform.message(converted, model, {})
      tTransform += performance.now() - t
    }
    console.log(`\n--- final history (${history.length} msgs), avg of ${N} ---`)
    console.log(`toModelMessages:          ${(tConv / N).toFixed(2)}ms`)
    console.log(`ProviderTransform.message: ${(tTransform / N).toFixed(2)}ms`)

    // Anthropic path runs the extra applyCaching + mapProviderOptions + empty-filter passes
    const antConverted = await MessageV2.toModelMessages(history, anthropicModel)
    let tAnt = 0
    for (let k = 0; k < N; k++) {
      const t = performance.now()
      ProviderTransform.message(antConverted, anthropicModel, {})
      tAnt += performance.now() - t
    }
    console.log(`ProviderTransform.message (anthropic): ${(tAnt / N).toFixed(2)}ms`)
  }, 60000)
})
